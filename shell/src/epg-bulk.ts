/**
 * The TV guide never waits on a slow 7-day EPG download.
 *
 * The client first asks for the whole guide (`get_epg_info`, 168 hours, every
 * channel) and gives each guide row 10 s. On a real portal that answer can take
 * longer: the row's deadline cancels it, the next row starts it again, and no
 * row ever reaches the quick per-channel request (`get_short_epg`). Here the
 * download runs once in the background with its own timeout; while it runs the
 * client gets "no bulk guide" straight away and falls back per channel.
 */
type Params = Record<string, string | number>;
export type BulkFetcher = (signal: AbortSignal) => Promise<unknown>;

/** A Stalker answer with no programmes: the client then asks per channel. */
export const EMPTY_BULK = { js: {} };

export interface BulkEpgOptions {
    /** How long a guide row waits for the download before falling back. */
    readonly waitMs?: number;
    /** How long a finished download is reused. */
    readonly ttlMs?: number;
    /** After a failed download, how long before trying again. */
    readonly retryAfterMs?: number;
}

interface Entry {
    readonly startedAt: number;
    readonly done: Promise<unknown>;
    readonly settled: boolean;
    readonly failed: boolean;
    readonly value: unknown;
}

export function isBulkEpg(params: Params): boolean {
    return params['type'] === 'itv' && params['action'] === 'get_epg_info';
}

export function createBulkEpg(options: BulkEpgOptions = {}) {
    const waitMs = options.waitMs ?? 2500;
    const ttlMs = options.ttlMs ?? 5 * 60_000;
    const retryAfterMs = options.retryAfterMs ?? 5 * 60_000;
    const entries = new Map<string, Entry>();

    function start(key: string, fetch: BulkFetcher): Entry {
        // Not tied to any guide row: closing or scrolling the guide must not cancel it.
        const controller = new AbortController();
        const state = { settled: false, failed: false, value: undefined as unknown };
        const done = fetch(controller.signal).then(
            (value) => {
                state.value = value;
            },
            () => {
                state.failed = true;
            }
        ).finally(() => {
            state.settled = true;
        });
        const entry: Entry = {
            startedAt: Date.now(),
            done,
            get settled() { return state.settled; },
            get failed() { return state.failed; },
            get value() { return state.value; },
        };
        entries.set(key, entry);
        return entry;
    }

    function current(key: string): Entry | undefined {
        const entry = entries.get(key);
        if (!entry) return undefined;
        const age = Date.now() - entry.startedAt;
        const expired = entry.settled && (entry.failed ? age > retryAfterMs : age > ttlMs);
        if (expired) entries.delete(key);
        return expired ? undefined : entry;
    }

    async function get(key: string, fetch: BulkFetcher): Promise<unknown> {
        const entry = current(key) ?? start(key, fetch);
        if (!entry.settled) {
            await Promise.race([entry.done, new Promise((r) => setTimeout(r, waitMs))]);
        }
        return entry.settled && !entry.failed ? entry.value : EMPTY_BULK;
    }

    return { get };
}
