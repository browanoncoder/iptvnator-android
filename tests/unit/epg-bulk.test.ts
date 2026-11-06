import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createBulkEpg, EMPTY_BULK, isBulkEpg } from '../../shell/src/epg-bulk';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BULK = { js: { '7': [{ name: 'News' }] } };

describe('The TV guide never waits on a slow 7-day EPG download', () => {
    test('only the whole-guide request qualifies', () => {
        assert.equal(isBulkEpg({ type: 'itv', action: 'get_epg_info', period: 168 }), true);
        assert.equal(isBulkEpg({ type: 'itv', action: 'get_short_epg', ch_id: 7 }), false);
        assert.equal(isBulkEpg({ type: 'vod', action: 'get_epg_info' }), false);
    });

    test('a fast portal answers as usual', async () => {
        const bulk = createBulkEpg({ waitMs: 50 });
        assert.deepEqual(await bulk.get('p', async () => BULK), BULK);
    });

    test('a slow portal gets "no bulk" at once; the download finishes in the background and is reused', async () => {
        const bulk = createBulkEpg({ waitMs: 20 });
        let calls = 0;
        const slow = async () => {
            calls++;
            await sleep(80);
            return BULK;
        };
        const t = Date.now();
        assert.deepEqual(await bulk.get('p', slow), EMPTY_BULK);
        assert.ok(Date.now() - t < 70, 'answered before the download finished');
        // A second guide row while it is still downloading: same single download.
        assert.deepEqual(await bulk.get('p', slow), EMPTY_BULK);
        await sleep(100);
        assert.deepEqual(await bulk.get('p', slow), BULK);
        assert.equal(calls, 1);
    });

    test('the background download is not cancelled with the guide row that started it', async () => {
        const bulk = createBulkEpg({ waitMs: 10 });
        let aborted = false;
        await bulk.get('p', async (signal) => {
            signal.addEventListener('abort', () => (aborted = true));
            await sleep(40);
            return BULK;
        });
        await sleep(60);
        assert.equal(aborted, false);
        assert.deepEqual(await bulk.get('p', async () => assert.fail('cached')), BULK);
    });

    test('a failed download is not retried in a loop', async () => {
        const bulk = createBulkEpg({ waitMs: 20, retryAfterMs: 1000 });
        let calls = 0;
        const failing = async () => {
            calls++;
            throw new Error('timeout');
        };
        assert.deepEqual(await bulk.get('p', failing), EMPTY_BULK);
        assert.deepEqual(await bulk.get('p', failing), EMPTY_BULK);
        assert.equal(calls, 1);
    });

    test('portals are kept apart and old guides expire', async () => {
        const bulk = createBulkEpg({ waitMs: 20, ttlMs: 30 });
        let calls = 0;
        const fetch = async () => {
            calls++;
            return BULK;
        };
        await bulk.get('a', fetch);
        await bulk.get('b', fetch);
        assert.equal(calls, 2);
        await sleep(40);
        await bulk.get('a', fetch);
        assert.equal(calls, 3);
    });
});
