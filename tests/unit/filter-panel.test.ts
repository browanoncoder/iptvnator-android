import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activeFilters, filtersLabel, keyboardOpen } from '../../shell/src/filter-panel';

describe('Phones fold the catalog filters behind one Filters button', () => {
    test('counts filters that differ from their default', () => {
        assert.equal(activeFilters(['All categories', 'Recently added']), 0);
        assert.equal(activeFilters(['TAMIL | MOVIES', 'Recently added']), 1);
        assert.equal(activeFilters(['TAMIL | MOVIES', 'Title · A–Z']), 2);
        assert.equal(activeFilters(['Live TV', 'All categories']), 1);
        assert.equal(activeFilters(['Movies', 'All categories']), 0);
    });
    test('the button says how many are on', () => {
        assert.equal(filtersLabel(0), 'Filters');
        assert.equal(filtersLabel(2), 'Filters · 2');
    });
    test('the keyboard counts as open when it takes a quarter of the height or more', () => {
        assert.equal(keyboardOpen(1300, 1300), false);
        assert.equal(keyboardOpen(1000, 1300), false);
        assert.equal(keyboardOpen(700, 1300), true);
        assert.equal(keyboardOpen(700, 0), false);
    });
});
