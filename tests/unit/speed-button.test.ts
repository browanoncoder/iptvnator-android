import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsSpeedButton } from '../../shell/src/speed-button';

describe('Speed button placement', () => {
    test('shown from the first frame when the row has the ±10 sec buttons (on-demand)', () => {
        assert.equal(wantsSpeedButton(['Pause Ⅱ', '−10 sec', '+10 sec', '♡ Save'], false), true);
    });

    test('shown once the duration is known even if the row has no seek buttons', () => {
        assert.equal(wantsSpeedButton(['Pause Ⅱ'], true), true);
    });

    test('not shown for live rows', () => {
        assert.equal(wantsSpeedButton(['Pause Ⅱ', 'Channels', 'Guide'], false), false);
    });
});
