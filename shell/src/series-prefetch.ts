/**
 * Long series open in seconds instead of half a minute.
 *
 * The TV client reads a season's episodes page by page, one request after the
 * other (a daily soap on a real portal: 79 pages, about 20 s, before any
 * episode shows). When page 1 of a series / season list comes back, the
 * embedded backend fetches the remaining pages a few at a time and keeps them
 * briefly; the client's next requests are answered from that cache.
 */
type Params = Record<string, string | number>;
export type PageFetcher = (page: number, signal: AbortSignal) => Promise<unknown>;

export interface PrefetcherOptions {
    /** Parallel requests to the portal (kept low: one portal, one account). */
    readonly concurrency?: number;
    /** How long fetched pages are kept. */
    readonly ttlMs?: number;
    /** Never prefetch more pages than this for one list. */
    readonly maxPages?: number;
}

interface Entry {
    readonly key: string;
    readonly createdAt: number;
    readonly pages: Map<number, Promise<unknown>>;
    readonly controller: AbortController;
}

/** Only episode / season lists of one title qualify; catalog paging stays lazy. */
export function prefetchKey(params: Params): string | undefined {
    if (params['action'] !== 'get_ordered_list' || params['movie_id'] === undefined) return undefined;
    return [params['action'], params['type'] ?? '', params['movie_id'], params['season_id'] ?? ''].join('|');
}

/** Pages in a Stalker list answer ({ js: { total_items, max_page_items, data } }). */
export function pageCount(payload: unknown): number {
    const js = (payload as { js?: { total_items?: unknown; max_page_items?: unknown; data?: unknown } } | null)?.js;
    if (!js) return 1;
    const total = Number(js.total_items);
    const rows = Array.isArray(js.data) ? js.data.length : 0;
    const per = Number(js.max_page_items) || rows;
    if (!Number.isFinite(total) || total <= 0 || per <= 0) return 1;
    return Math.max(1, Math.ceil(total / per));
}

export function createPagePrefetcher(options: PrefetcherOptions) {
    const concurrency = options.concurrency ?? 4;
    const ttlMs = options.ttlMs ?? 60_000;
    const maxPages = options.maxPages ?? 200;
    let current: Entry | undefined;

    function entryFor(key: string): Entry | undefined {
        if (!current || current.key !== key) return undefined;
        if (Date.now() - current.createdAt > ttlMs) {
            current.controller.abort();
            current = undefined;
            return undefined;
        }
        return current;
    }

    /** A few workers walk pages 2…N; each page gets a promise up front so requests can wait on it. */
    function prefetch(entry: Entry, pages: number, fetchPage: PageFetcher): void {
        const last = Math.min(pages, maxPages);
        const settle = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
        for (let n = 2; n <= last; n++) {
            const promise = new Promise<unknown>((resolve, reject) => settle.set(n, { resolve, reject }));
            // A failed prefetch is retried on demand; never an unhandled rejection.
            promise.catch(() => undefined);
            entry.pages.set(n, promise);
        }
        let next = 2;
        const worker = async (): Promise<void> => {
            while (next <= last) {
                const n = next++;
                const done = settle.get(n)!;
                if (entry.controller.signal.aborted) {
                    done.reject(new Error('prefetch cancelled'));
                    continue;
                }
                try {
                    done.resolve(await fetchPage(n, entry.controller.signal));
                } catch (error) {
                    done.reject(error);
                }
            }
        };
        for (let i = 0; i < Math.min(concurrency, last - 1); i++) void worker();
    }

    async function get(key: string, page: number, fetchPage: PageFetcher, signal?: AbortSignal): Promise<unknown> {
        const own = signal ?? new AbortController().signal;
        const entry = entryFor(key);
        const cached = entry?.pages.get(page);
        if (cached) {
            try {
                return await cached;
            } catch {
                return fetchPage(page, own);
            }
        }
        const answer = await fetchPage(page, own);
        if (page === 1) {
            current?.controller.abort();
            const fresh: Entry = { key, createdAt: Date.now(), pages: new Map(), controller: new AbortController() };
            current = fresh;
            const pages = pageCount(answer);
            if (pages > 1) prefetch(fresh, pages, fetchPage);
        }
        return answer;
    }

    return { get };
}
