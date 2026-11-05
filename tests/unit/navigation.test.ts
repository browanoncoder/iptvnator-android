import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbourIndex, zapDirection } from '../../shell/src/channel-zap';
import { nextIndex, type Box } from '../../shell/src/quick-menu';

describe('channel zapping', () => {
    const list = (playing: number, length = 4) => Array.from({ length }, (_, i) => ({ playing: i === playing }));
    test('moves to the neighbouring channel', () => {
        assert.equal(neighbourIndex(list(1), 1), 2);
        assert.equal(neighbourIndex(list(1), -1), 0);
    });
    test('stops at either end of the category', () => {
        assert.equal(neighbourIndex(list(3), 1), -1);
        assert.equal(neighbourIndex(list(0), -1), -1);
        assert.equal(neighbourIndex(list(-1), 1), -1);
    });
    test('remote keys map to directions', () => {
        const key = (k: string, keyCode = 0) => ({ key: k, keyCode });
        assert.deepEqual(zapDirection(key('ChannelUp')), { direction: 1, channelKey: true });
        assert.deepEqual(zapDirection(key('PageDown')), { direction: -1, channelKey: true });
        assert.deepEqual(zapDirection(key('ArrowDown')), { direction: 1, channelKey: false });
        assert.deepEqual(zapDirection(key('ArrowUp')), { direction: -1, channelKey: false });
        assert.deepEqual(zapDirection(key('', 427)), { direction: 1, channelKey: true });
        assert.equal(zapDirection(key('Enter')), undefined);
    });
});

describe('quick menu spatial navigation', () => {
    // Row 0: three buttons; row 1: two buttons; row 2: one wide button.
    const boxes: Box[] = [
        { left: 0, top: 0, width: 100, height: 50 },
        { left: 120, top: 0, width: 100, height: 50 },
        { left: 240, top: 0, width: 100, height: 50 },
        { left: 0, top: 80, width: 150, height: 50 },
        { left: 170, top: 80, width: 150, height: 50 },
        { left: 0, top: 160, width: 300, height: 50 },
    ];
    test('left/right stay in the row', () => {
        assert.equal(nextIndex(boxes, 0, 'right'), 1);
        assert.equal(nextIndex(boxes, 1, 'left'), 0);
        assert.equal(nextIndex(boxes, 2, 'right'), 2);
    });
    test('up/down pick the nearest button in the next row', () => {
        assert.equal(nextIndex(boxes, 2, 'down'), 4);
        assert.equal(nextIndex(boxes, 0, 'down'), 3);
        assert.equal(nextIndex(boxes, 4, 'down'), 5);
        assert.equal(nextIndex(boxes, 5, 'up'), 3);
        assert.equal(nextIndex(boxes, 0, 'up'), 0);
    });
});
