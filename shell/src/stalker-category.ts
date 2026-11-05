/**
 * Stalker portals disagree on which parameter filters a VOD/series list by
 * category. The TV client sends both `category` and `genre` with the same id;
 * some portals (seen on a real provider) answer that with an empty list.
 * IPTVnator's desktop app sends `category=<id>&genre=0` for VOD and
 * `category=<id>` alone for series, which those portals answer correctly.
 *
 * The embedded backend asks the desktop way first, then falls back to the
 * client's form and to genre only, keeping the first non-empty answer.
 */
type Params = Record<string, string | number>;

const CATALOG_TYPES = new Set(['vod', 'series']);

function without(params: Params, key: string): Params {
    return Object.fromEntries(Object.entries(params).filter(([k]) => k !== key));
}

/** Parameter sets to try for a filtered catalog page, in order (empty: send as is). */
export function categoryVariants(params: Params): Params[] {
    const category = String(params['category'] ?? '');
    if (
        params['action'] !== 'get_ordered_list' ||
        !CATALOG_TYPES.has(String(params['type'])) ||
        !category ||
        category === '*' ||
        String(params['genre'] ?? '') !== category
    )
        return [];
    const desktop = params['type'] === 'vod' ? { ...params, genre: '0' } : without(params, 'genre');
    return [desktop, params, without(params, 'category')];
}

function js(payload: unknown): { total_items?: unknown; data?: unknown } | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const value = (payload as { js?: unknown }).js;
    return value && typeof value === 'object' ? (value as { total_items?: unknown; data?: unknown }) : undefined;
}

function rows(payload: unknown): Record<string, unknown>[] {
    const data = js(payload)?.data;
    return Array.isArray(data) ? data.filter((r) => r && typeof r === 'object') : [];
}

export function isEmptyList(payload: unknown): boolean {
    const envelope = js(payload);
    if (!envelope) return false;
    return rows(payload).length === 0 && !Number(envelope.total_items);
}

export function rowsInCategory(payload: unknown, category: string): boolean {
    const list = rows(payload);
    return list.length > 0 && list.every((row) => String(row['category_id']) === category);
}

/**
 * Some portals have no separate Series module (their series sit in the VOD
 * catalog) and answer every `type=series` request with `js:false`. The client
 * would report that as a connection failure and keep retrying; an empty
 * answer shows an empty Series page instead.
 */
export function withoutSeriesModule(params: Params, payload: unknown): unknown {
    if (params['type'] !== 'series' || !payload || typeof payload !== 'object') return payload;
    if ((payload as { js?: unknown }).js !== false) return payload;
    if (params['action'] === 'get_categories') return { js: [] };
    if (params['action'] === 'get_ordered_list') return { js: { data: [], total_items: 0, max_page_items: 14 } };
    return payload;
}
