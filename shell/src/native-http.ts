/**
 * Thin wrapper over Capacitor's built-in native HTTP plugin.
 *
 * Native requests bypass CORS and may set browser-forbidden headers
 * (Cookie, User-Agent), which is what lets the APK talk to portals directly.
 */
export class NativeHttpError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message);
    }
}

export interface NativeResponse {
    status: number;
    data: unknown;
}

interface NativeGetOptions {
    headers: Record<string, string>;
    timeoutMs: number;
    signal?: AbortSignal;
    responseType?: 'text' | 'json';
}

interface CapacitorHttpPlugin {
    request(options: {
        url: string;
        method: string;
        headers: Record<string, string>;
        connectTimeout: number;
        readTimeout: number;
        responseType: 'text';
    }): Promise<{ status: number; data: unknown }>;
}

function plugin(): CapacitorHttpPlugin {
    const http = (window as unknown as { Capacitor?: { Plugins?: { CapacitorHttp?: CapacitorHttpPlugin } } })
        .Capacitor?.Plugins?.CapacitorHttp;
    if (!http) throw new NativeHttpError(503, 'Native HTTP is unavailable in this runtime');
    return http;
}

/** Portals often answer JSON as text/html; parse when it looks like JSON, else keep text. */
function decode(data: unknown, responseType: 'text' | 'json'): unknown {
    if (responseType === 'text' || typeof data !== 'string') return data;
    const trimmed = data.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return data;
    try {
        return JSON.parse(trimmed);
    } catch {
        return data;
    }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

export async function nativeGet(url: string, options: NativeGetOptions): Promise<NativeResponse> {
    let response: { status: number; data: unknown };
    try {
        response = await abortable(
            plugin().request({
                url,
                method: 'GET',
                headers: options.headers,
                connectTimeout: Math.min(options.timeoutMs, 15000),
                readTimeout: options.timeoutMs,
                // Always fetch text: the plugin's JSON mode rejects the plain-text
                // bodies portals use for auth failures.
                responseType: 'text',
            }),
            options.signal
        );
    } catch (error) {
        if (error instanceof DOMException) throw error;
        throw new NativeHttpError(0, error instanceof Error ? error.message : 'Network request failed');
    }
    if (response.status >= 400) {
        throw new NativeHttpError(response.status, `Provider responded with HTTP ${response.status}`);
    }
    return { status: response.status, data: decode(response.data, options.responseType ?? 'json') };
}
