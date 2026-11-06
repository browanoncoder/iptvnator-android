import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createChannelLocks, isLockedRow, LOCK_MARK, markLockedChannels, portalPin, DEFAULT_PIN } from '../../shell/src/channel-lock';

const list = (rows: Record<string, unknown>[]) => ({ js: { total_items: rows.length, data: rows } });

describe('Password-protected channels ask for the PIN', () => {
    test('a row is locked when the portal marks it censored', () => {
        assert.equal(isLockedRow({ censored: 1 }), true);
        assert.equal(isLockedRow({ censored: '1' }), true);
        assert.equal(isLockedRow({ censored: 0 }), false);
        assert.equal(isLockedRow({}), false);
    });
    test('locked channels get a 🔒 and always go through create_link; others are untouched', () => {
        const input = list([
            { id: '1', name: 'News', cmd: 'ffrt http://a/1', censored: 0 },
            { id: '2', name: 'Late Night', cmd: 'ffrt http://a/2', censored: '1', use_http_tmp_link: '0' },
        ]);
        const { payload, lockedCmds } = markLockedChannels(input);
        const rows = (payload as typeof input).js.data;
        assert.equal(rows[0].name, 'News');
        assert.equal(rows[1].name, `${LOCK_MARK}Late Night`);
        assert.equal(rows[1].use_http_tmp_link, '1');
        assert.deepEqual(lockedCmds, ['ffrt http://a/2']);
        assert.equal(input.js.data[1].name, 'Late Night', 'input is not mutated');
    });
    test('marking twice does not add a second 🔒', () => {
        const once = markLockedChannels(list([{ name: 'X', cmd: 'c', censored: 1 }])).payload;
        const twice = markLockedChannels(once).payload as ReturnType<typeof list>;
        assert.equal(twice.js.data[0].name, `${LOCK_MARK}X`);
    });
    test('answers that are not channel lists pass through', () => {
        assert.deepEqual(markLockedChannels('x').lockedCmds, []);
        assert.deepEqual(markLockedChannels({ js: { cmd: 'y' } }).lockedCmds, []);
    });
    test('the PIN is the account parental password, 0000 when the portal sends none', () => {
        assert.equal(portalPin({ js: { parent_password: '4321' } }), '4321');
        assert.equal(portalPin({ js: { parent_password: 1234 } }), '1234');
        assert.equal(portalPin({ js: {} }), DEFAULT_PIN);
        assert.equal(portalPin(undefined), DEFAULT_PIN);
    });
    test('locks are per portal, and unlocking lasts until the app closes', () => {
        const locks = createChannelLocks();
        locks.remember('portal-a', ['c1']);
        assert.equal(locks.needsPin('portal-a', 'c1'), true);
        assert.equal(locks.needsPin('portal-a', 'c2'), false);
        assert.equal(locks.needsPin('portal-b', 'c1'), false);
        locks.unlock('portal-a');
        assert.equal(locks.needsPin('portal-a', 'c1'), false);
    });
});

import { padMove } from '../../shell/src/pin-prompt';

describe('The PIN pad moves like a remote expects', () => {
    test('arrows walk the 3 × 4 pad and stop at its edges', () => {
        assert.equal(padMove(0, 'ArrowLeft'), 0);
        assert.equal(padMove(0, 'ArrowRight'), 1);
        assert.equal(padMove(2, 'ArrowRight'), 2);
        assert.equal(padMove(1, 'ArrowDown'), 4);
        assert.equal(padMove(10, 'ArrowDown'), 10);
        assert.equal(padMove(4, 'ArrowUp'), 1);
        assert.equal(padMove(0, 'ArrowUp'), 0);
    });
});
