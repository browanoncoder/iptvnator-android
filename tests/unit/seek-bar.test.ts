import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { seekStep, seekTarget } from '../../shell/src/seek-bar';

describe('remote seek bar', () => {
    test('one press moves 2% of the title, between 10 s and 5 min', () => {
        assert.equal(seekStep(6947), 138.94); // 1:55:47 movie → ~2:19 per press
        assert.equal(seekStep(300), 10); // short clip never drops below 10 s
        assert.equal(seekStep(36000), 300); // 10 h stream caps at 5 min
    });
    test('the middle of a two-hour movie is 25 presses away', () => {
        let t = 0;
        for (let i = 0; i < 25; i++) t = seekTarget(t, 1, 7200);
        assert.equal(t, 3600);
    });
    test('targets stay inside the title', () => {
        assert.equal(seekTarget(10, -1, 7200), 0);
        assert.equal(seekTarget(7150, 1, 7200), 7199);
    });
});
