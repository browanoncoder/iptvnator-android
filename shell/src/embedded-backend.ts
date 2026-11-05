/**
 * On-device replacement for the IPTVnator web backend.
 *
 * The TV client talks to a backend over six HTTP routes. Inside the Android
 * shell those routes are answered in-process: `window.fetch` calls addressed
 * to {@link EMBEDDED_BACKEND_URL} never leave the WebView, and the provider
 * requests behind them go out through Capacitor's native HTTP stack, which may
 * set the Cookie / User-Agent headers MAG portals require and is not subject
 * to CORS. Header and URL construction is shared with the real backend.
 */
import { createChannelLocks, DEFAULT_PIN, markLockedChannels, portalPin } from './channel-lock';
import { requestPin } from './pin-prompt';
import { createPagePrefetcher, prefetchKey } from './series-prefetch';
import parser from 'iptv-playlist-parser';
import { buildStalkerIdentityRequestContext } from '../../../iptvnator/libs/shared/interfaces/src/lib/stalker-request-identity.util';
import { buildStalkerRequestUrl } from '../../../iptvnator/libs/shared/interfaces/src/lib/stalker-request-url.util';
import { normalizeXtreamServerUrl } from '../../../iptvnator/libs/shared/interfaces/src/lib/xtream-portal.utils';
import { createPlaylistObject } from '../../../iptvnator/libs/shared/m3u-utils/src';
import { nativeGet, NativeHttpError } from './native-http';
import { categoryVariants, isEmptyList, withoutSeriesModule } from './stalker-category';

export const EMBEDDED_BACKEND_URL = 'http://iptvnator.device';

const TIMEOUT_MS = { stalker: 20000, createLink: 30000, xtream: 30000, playlist: 120000 };

type Query = URLSearchParams;
type RouteResult = { status: number; body: unknown };

const targets = new Map<string, string>();

function ok(body: unknown): RouteResult {
    return { status: 200, body };
}

function fail(status: number, message: string): RouteResult {
    return { status, body: { status, message } };
}

/** Provider failures are answered as HTTP 200 + error body, like the real backend. */
function providerFailure(error: unknown): RouteResult {
    if (error instanceof NativeHttpError) {
        return ok({ status: error.status || 502, message: error.message });
    }
    return ok({ status: 502, message: 'Error, something went wrong' });
}

function proxyParams(query: Query, excluded: string[]): Record<string, string> {
    const params: Record<string, string> = {};
    query.forEach((value, key) => {
        const trimmed = value.trim();
        if (!excluded.includes(key) && trimmed) params[key] = trimmed;
    });
    return params;
}

function registeredUrl(query: Query): string | undefined {
    const id = query.get('targetId');
    return id ? targets.get(id) : undefined;
}

function registerTarget(body: unknown): RouteResult {
    const raw = (body as { url?: unknown } | null)?.url;
    if (typeof raw !== 'string') return fail(400, 'Missing url');
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return fail(400, 'Invalid url');
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
        return fail(400, 'Only HTTP(S) URLs without embedded credentials are allowed');
    }
    const existing = [...targets].find(([, value]) => value === url.href);
    const id = existing?.[0] ?? crypto.randomUUID();
    targets.set(id, url.href);
    return ok({ targetId: id });
}

async function stalker(query: Query, signal?: AbortSignal): Promise<RouteResult> {
    const url = registeredUrl(query);
    if (!url) return fail(404, 'Provider target not found');
    const macAddress = query.get('macAddress') ?? '';
    const token = query.get('token') ?? undefined;
    const serialNumber = query.get('serialNumber') ?? undefined;
    // Credentials travel as headers only, never in the portal query string,
    // except the handshake's candidate token (same rule as the web backend).
    const params: Record<string, string | number> = proxyParams(query, [
        'targetId',
        'macAddress',
        'token',
        'serialNumber',
        'skipConnectionGuard',
    ]);
    if (params['action'] === 'handshake' && token) params['token'] = token;
    const send = async (variant: Record<string, string | number>, abort: AbortSignal | undefined = signal) => {
        const identity = buildStalkerIdentityRequestContext({
            macAddress,
            params: variant,
            ...(token ? { token } : {}),
            ...(serialNumber ? { serialNumber } : {}),
        });
        const headers = { ...identity.headers };
        if (!macAddress) delete headers['Cookie'];
        const response = await nativeGet(buildStalkerRequestUrl(url, identity.requestParams), {
            headers,
            signal: abort,
            timeoutMs: variant['action'] === 'create_link' ? TIMEOUT_MS.createLink : TIMEOUT_MS.stalker,
        });
        return response.data;
    };
    const portal = `${url}|${macAddress}`;
    try {
        const blocked = await pinGate(portal, params, send, signal);
        if (blocked) return blocked;
        const series = prefetchKey(params);
        const answer = series
            ? await episodePages.get(`${url}|${macAddress}|${series}`, Number(params['p'] ?? 1) || 1, (p, abort) => send({ ...params, p }, abort), signal)
            : await filteredList(url, params, send);
        return ok({ action: query.get('action'), payload: withoutSeriesModule(params, lockChannels(portal, params, answer)) });
    } catch (error) {
        return providerFailure(error);
    }
}

/** Password-protected live channels (channel-lock.ts). */
const channelLocks = createChannelLocks();
const portalPins = new Map<string, string>();

/** Marks locked channels in live channel lists and remembers them. */
function lockChannels(portal: string, params: Record<string, string | number>, answer: unknown): unknown {
    const action = params['action'];
    if (params['type'] !== 'itv' || (action !== 'get_ordered_list' && action !== 'get_all_channels')) return answer;
    const { payload, lockedCmds } = markLockedChannels(answer);
    channelLocks.remember(portal, lockedCmds);
    return payload;
}

/** Holds a locked channel's stream link until the parental PIN is entered; an answer when it stays locked. */
async function pinGate(
    portal: string,
    params: Record<string, string | number>,
    send: (variant: Record<string, string | number>) => Promise<unknown>,
    signal?: AbortSignal
): Promise<RouteResult | undefined> {
    if (params['type'] !== 'itv' || params['action'] !== 'create_link') return undefined;
    if (!channelLocks.needsPin(portal, String(params['cmd'] ?? ''))) return undefined;
    let pin = portalPins.get(portal);
    if (pin === undefined) {
        pin = await send({ type: 'stb', action: 'get_profile' }).then(portalPin, () => DEFAULT_PIN);
        portalPins.set(portal, pin);
    }
    const expected = pin;
    if (await requestPin((entered) => entered === expected, signal)) {
        channelLocks.unlock(portal);
        return undefined;
    }
    return ok({ status: 403, message: 'This channel is locked. Enter the parental PIN to watch it.' });
}

/** Episode / season pages of the title being opened, fetched ahead (series-prefetch.ts). */
const episodePages = createPagePrefetcher({ concurrency: 4 });

/** Which category-filter form each portal category answered to (see stalker-category.ts). */
const categoryForm = new Map<string, number>();

async function filteredList(
    url: string,
    params: Record<string, string | number>,
    send: (variant: Record<string, string | number>) => Promise<unknown>
): Promise<unknown> {
    const forms = categoryVariants(params);
    if (!forms.length) return send(params);
    const key = `${url}|${params['type']}|${params['category']}`;
    const known = categoryForm.get(key);
    if (known !== undefined) return send(forms[known]);
    let first: unknown;
    for (let i = 0; i < forms.length; i++) {
        const answer = await send(forms[i]);
        if (!isEmptyList(answer)) {
            categoryForm.set(key, i);
            return answer;
        }
        if (i === 0) first = answer;
    }
    return first;
}

async function xtream(query: Query, signal?: AbortSignal): Promise<RouteResult> {
    const url = registeredUrl(query);
    if (!url) return fail(404, 'Provider target not found');
    const base = new URL(normalizeXtreamServerUrl(url));
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/player_api.php`;
    base.search = '';
    const params = proxyParams(query, ['targetId', 'connectionTest', 'userAgent']);
    Object.keys(params).forEach((key) => base.searchParams.set(key, params[key]));
    const userAgent = query.get('userAgent')?.trim();
    try {
        const response = await nativeGet(base.href, {
            headers: userAgent ? { 'User-Agent': userAgent } : {},
            signal,
            timeoutMs: TIMEOUT_MS.xtream,
        });
        return ok({ action: query.get('action'), payload: response.data });
    } catch (error) {
        if (query.get('connectionTest') === 'true') {
            return ok({ connectionFailure: { kind: 'connection', canTryHttp: false } });
        }
        return providerFailure(error);
    }
}

async function parsePlaylist(query: Query, signal?: AbortSignal): Promise<RouteResult> {
    const url = registeredUrl(query);
    if (!url) return fail(404, 'Provider target not found');
    const userAgent = query.get('userAgent')?.trim() || undefined;
    try {
        const response = await nativeGet(url, {
            headers: userAgent ? { 'User-Agent': userAgent } : {},
            signal,
            timeoutMs: TIMEOUT_MS.playlist,
            responseType: 'text',
        });
        const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
        const title = url.slice(url.lastIndexOf('/') + 1).trim() || 'Playlist without title';
        const playlist = createPlaylistObject(title, parser.parse(text), url, 'URL');
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        return ok({
            ...playlist,
            playlist: {
                ...playlist.playlist,
                items: playlist.playlist.items.map((item: object) => ({ ...item, id: crypto.randomUUID() })),
            },
            id,
            _id: id,
            importDate: now,
            lastUsage: now,
            ...(userAgent ? { userAgent } : {}),
        });
    } catch (error) {
        if (error instanceof NativeHttpError) {
            return fail(error.status || 500, error.message);
        }
        return fail(500, 'Error, something went wrong');
    }
}

/** Answers one embedded-backend request; exported for tests. */
export async function route(method: string, url: URL, body: unknown, signal?: AbortSignal): Promise<RouteResult> {
    switch (`${method} ${url.pathname}`) {
        case 'GET /tv/connection':
            return ok({ service: 'iptvnator', protocol: 1, pairing: true, auth: 'none' });
        case 'GET /tv/connection/check':
            return ok({ service: 'iptvnator', connected: true });
        case 'POST /provider-targets':
            return registerTarget(body);
        case 'GET /stalker':
            return stalker(url.searchParams, signal);
        case 'GET /xtream':
            return xtream(url.searchParams, signal);
        case 'GET /parse':
            return parsePlaylist(url.searchParams, signal);
        default:
            return fail(404, 'Not available in the on-device backend');
    }
}

function readBody(init?: RequestInit): unknown {
    if (typeof init?.body !== 'string') return undefined;
    try {
        return JSON.parse(init.body);
    } catch {
        return undefined;
    }
}

/** Routes fetch() calls for the embedded backend in-process; everything else is untouched. */
export function installEmbeddedBackend(): void {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!href.startsWith(EMBEDDED_BACKEND_URL)) return realFetch(input, init);
        const signal = init?.signal ?? undefined;
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const result = await route((init?.method ?? 'GET').toUpperCase(), new URL(href), readBody(init), signal);
        return new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'Content-Type': 'application/json' },
        });
    };
}
