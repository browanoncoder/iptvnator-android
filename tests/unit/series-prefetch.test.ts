import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPagePrefetcher, pageCount, prefetchKey } from '../../shell/src/series-prefetch';

const page = (n: number, total = 50, per = 10) => ({ js: { total_items: total, max_page_items: per, data: [{ id: `${n}` }] } });

describe('Long series load their episode pages in parallel', () => {
    test('pageCount reads total_items / max_page_items', () => {
        assert.equal(pageCount(page(1, 790, 10)), 79);
        assert.equal(pageCount(page(1, 5, 10)), 1);
        assert.equal(pageCount({ js: { total_items: 30, data: [1, 2, 3] } }), 10);
        assert.equal(pageCount('nonsense'), 1);
    });
    test('only series / season lists are prefetched, keyed without the page', () => {
        assert.equal(prefetchKey({ action: 'get_ordered_list', type: 'vod', movie_id: 7, season_id: 3, p: 4 }), 'get_ordered_list|vod|7|3');
        assert.equal(prefetchKey({ action: 'get_ordered_list', type: 'vod', category: 9, p: 1 }), undefined);
        assert.equal(prefetchKey({ action: 'create_link', movie_id: 7 }), undefined);
    });
    test('page 1 triggers the rest; later pages come from the cache', async () => {
        const calls: number[] = [];
        let inFlight = 0;
        let maxInFlight = 0;
        const fetchPage = async (n: number) => {
            calls.push(n);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return page(n);
        };
        const prefetcher = createPagePrefetcher({ concurrency: 2 });
        assert.deepEqual(await prefetcher.get('k', 1, fetchPage), page(1));
        for (let n = 2; n <= 5; n++) assert.deepEqual(await prefetcher.get('k', n, fetchPage), page(n));
        assert.deepEqual([...calls].sort(), [1, 2, 3, 4, 5]);
        assert.ok(maxInFlight <= 2, `at most 2 at once, saw ${maxInFlight}`);
    });
    test('a failed prefetch is retried when the page is asked for', async () => {
        let failOnce = true;
        const fetchPage = async (n: number) => {
            if (n === 2 && failOnce) {
                failOnce = false;
                throw new Error('flaky');
            }
            return page(n, 20);
        };
        const prefetcher = createPagePrefetcher({});
        await prefetcher.get('k', 1, fetchPage);
        assert.deepEqual(await prefetcher.get('k', 2, fetchPage), page(2, 20));
    });
    test('opening another series cancels the previous prefetch', async () => {
        const seen: string[] = [];
        const slow = (key: string) => async (n: number, signal: AbortSignal) => {
            await new Promise((r) => setTimeout(r, 10));
            if (signal.aborted) throw new Error('aborted');
            seen.push(`${key}${n}`);
            return page(n, 100);
        };
        const prefetcher = createPagePrefetcher({ concurrency: 1 });
        await prefetcher.get('a', 1, slow('a'));
        await prefetcher.get('b', 1, slow('b'));
        await new Promise((r) => setTimeout(r, 60));
        assert.ok(seen.filter((s) => s.startsWith('a')).length < 5, seen.join());
    });
});
