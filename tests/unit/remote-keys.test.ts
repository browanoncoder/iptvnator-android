import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { digitTarget } from '../../shell/src/remote-keys';
import { zapDirection } from '../../shell/src/channel-zap';
import { controlsDormant, CONTROLS_HIDDEN } from '../../shell/src/player-dom';

describe('remote keys', () => {
    test('number keys jump to tenths of the title: 5 is the middle, 0 the start', () => {
        assert.equal(digitTarget('5', 7200), 3600);
        assert.equal(digitTarget('1', 7200), 720);
        assert.equal(digitTarget('9', 7200), 6480);
        assert.equal(digitTarget('0', 7200), 0);
        assert.equal(digitTarget('a', 7200), undefined);
    });
    test('Next / Previous track keys switch channels on live TV', () => {
        assert.deepEqual(zapDirection({ key: 'MediaTrackNext', keyCode: 176 }), { direction: 1, channelKey: true });
        assert.deepEqual(zapDirection({ key: 'MediaTrackPrevious', keyCode: 177 }), { direction: -1, channelKey: true });
    });
    test('controls count as hidden when the shell hid them with Back', () => {
        const doc = {
            querySelector: () => null,
            documentElement: { classList: { contains: (c: string) => c === CONTROLS_HIDDEN } },
        } as unknown as Document;
        assert.equal(controlsDormant(doc), true);
    });
});
