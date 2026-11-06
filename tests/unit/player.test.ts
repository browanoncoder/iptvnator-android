import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isSwipeUp, scanRate, tapHidesControls, tapSide } from '../../shell/src/player-gestures';
import { clampTime, clock, isBackKey, isLivePlayback, playerFullscreen, signedClock } from '../../shell/src/player-dom';
import { nextSpeed, SPEEDS } from '../../shell/src/playback-speed';
import { fakeDoc } from './helpers';

describe('player helpers', () => {
    test('clock formats minutes and hours', () => {
        assert.equal(clock(0), '0:00');
        assert.equal(clock(65.9), '1:05');
        assert.equal(clock(3725), '1:02:05');
        assert.equal(clock(-5), '0:00');
        assert.equal(signedClock(-70), '−1:10');
        assert.equal(signedClock(10), '+0:10');
    });
    test('clampTime keeps seeks inside the media', () => {
        assert.equal(clampTime(-3, 100), 0);
        assert.equal(clampTime(500, 100), 99);
        assert.equal(clampTime(42, 100), 42);
    });
    test('scan accelerates the longer a key is held', () => {
        assert.equal(scanRate(0), 20);
        assert.equal(scanRate(1499), 20);
        assert.equal(scanRate(1500), 40);
        assert.equal(scanRate(4500), 160);
        assert.equal(scanRate(6000), 320);
    });
    test('double-tap sides are the outer thirds', () => {
        assert.equal(tapSide(10, 900), -1);
        assert.equal(tapSide(450, 900), 0);
        assert.equal(tapSide(890, 900), 1);
    });
    test('swipe up must be mostly vertical and long enough', () => {
        assert.equal(isSwipeUp(0, -120), true);
        assert.equal(isSwipeUp(0, -40), false);
        assert.equal(isSwipeUp(100, -120), false);
        assert.equal(isSwipeUp(0, 120), false);
    });
    test('speed cycles 1× → 3× and wraps', () => {
        const seen = [1];
        for (let i = 0; i < SPEEDS.length; i++) seen.push(nextSpeed(seen[seen.length - 1]));
        assert.deepEqual(seen, [1, 1.25, 1.5, 2, 3, 1]);
    });
    test('live is detected from the client UI, not the stream duration', () => {
        assert.equal(isLivePlayback(fakeDoc(['[data-focus="player-channels"]'])), true);
        assert.equal(isLivePlayback(fakeDoc(['main.live-page'])), true);
        assert.equal(isLivePlayback(fakeDoc([])), false);
        assert.equal(playerFullscreen(fakeDoc(['.native-player.fullscreen'])), true);
        assert.equal(playerFullscreen(fakeDoc([])), false);
    });
    test('Back is recognised from Android, webOS and keyboards', () => {
        const key = (k: string, keyCode = 0) => ({ key: k, keyCode }) as KeyboardEvent;
        assert.equal(isBackKey(key('BrowserBack')), true);
        assert.equal(isBackKey(key('', 461)), true);
        assert.equal(isBackKey(key('Escape')), true);
        assert.equal(isBackKey(key('Enter')), false);
    });
});

describe('tap on the picture toggles the controls', () => {
    test('a single tap while the controls are up hides them', () => {
        assert.equal(tapHidesControls({ controlsWereVisible: true, doubleTapped: false }), true);
    });
    test('a tap while they are hidden only shows them', () => {
        assert.equal(tapHidesControls({ controlsWereVisible: false, doubleTapped: false }), false);
    });
    test('a double-tap skips and leaves the controls alone', () => {
        assert.equal(tapHidesControls({ controlsWereVisible: true, doubleTapped: true }), false);
    });
});
