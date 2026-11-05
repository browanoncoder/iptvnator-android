import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryVariants, isEmptyList, rowsInCategory } from '../../shell/src/stalker-category';

const list = { type: 'vod', action: 'get_ordered_list', category: '20', genre: '20', sortby: 'added', p: 1 };

describe('Stalker category filter fallback', () => {
    test('movies are asked the desktop way first (genre=0), then as sent, then genre only', () => {
        const [desktop, asSent, genreOnly] = categoryVariants(list);
        assert.deepEqual(desktop, { ...list, genre: '0' });
        assert.deepEqual(asSent, list);
        assert.deepEqual(genreOnly, { type: 'vod', action: 'get_ordered_list', genre: '20', sortby: 'added', p: 1 });
    });
    test('series are asked by category alone first, like the desktop app', () => {
        const [desktop] = categoryVariants({ ...list, type: 'series' });
        assert.deepEqual(desktop, { type: 'series', action: 'get_ordered_list', category: '20', sortby: 'added', p: 1 });
    });
    test('unfiltered lists, live TV and other actions are left alone', () => {
        assert.deepEqual(categoryVariants({ ...list, category: '*', genre: '*' }), []);
        assert.deepEqual(categoryVariants({ ...list, type: 'itv' }), []);
        assert.deepEqual(categoryVariants({ type: 'vod', action: 'get_categories' }), []);
        assert.deepEqual(categoryVariants({ ...list, genre: '7' }), []);
    });
    test('empty means no rows and no total', () => {
        assert.equal(isEmptyList({ js: { total_items: '0', data: [] } }), true);
        assert.equal(isEmptyList({ js: { total_items: 660, data: [{ id: 1 }] } }), false);
        assert.equal(isEmptyList('not json'), false);
    });
    test('a category-only answer counts only when its rows belong to the category', () => {
        assert.equal(rowsInCategory({ js: { data: [{ category_id: '20' }, { category_id: 20 }] } }, '20'), true);
        // Portals that ignore `category` return the whole catalog.
        assert.equal(rowsInCategory({ js: { data: [{ category_id: '20' }, { category_id: '1' }] } }, '20'), false);
        assert.equal(rowsInCategory({ js: { data: [] } }, '20'), false);
    });
});

describe('portals without a Series module', () => {
    test('js:false for series becomes an empty answer, not a connection error', async () => {
        const { withoutSeriesModule } = await import('../../shell/src/stalker-category');
        const refused = { js: false, text: 'generated in: 0.016s' };
        assert.deepEqual(withoutSeriesModule({ type: 'series', action: 'get_categories' }, refused), { js: [] });
        assert.deepEqual(withoutSeriesModule({ type: 'series', action: 'get_ordered_list', p: 1 }, refused), {
            js: { data: [], total_items: 0, max_page_items: 14 },
        });
        // Other refusals (e.g. an unauthorised session) are left for the client to report.
        assert.deepEqual(withoutSeriesModule({ type: 'vod', action: 'get_ordered_list' }, refused), refused);
        assert.deepEqual(withoutSeriesModule({ type: 'series', action: 'get_ordered_list' }, { js: { data: [1] } }), { js: { data: [1] } });
    });
});
