import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { scanLabel, scanTier, SCAN_TIER_MS } from '../../shell/src/scan-speed';

describe('Holding ← / → speeds up like Netflix / Prime (1× → 5×)', () => {
    test('a new level every 1.5 s, capped at 5×', () => {
        assert.equal(scanTier(0).level, 1);
        assert.equal(scanTier(SCAN_TIER_MS - 1).level, 1);
        assert.equal(scanTier(SCAN_TIER_MS).level, 2);
        assert.equal(scanTier(SCAN_TIER_MS * 2).level, 3);
        assert.equal(scanTier(SCAN_TIER_MS * 3).level, 4);
        assert.equal(scanTier(SCAN_TIER_MS * 4).level, 5);
        assert.equal(scanTier(60_000).level, 5);
    });
    test('each level doubles the scan rate (20 s → 320 s of video per second)', () => {
        assert.deepEqual([0, 1, 2, 3, 4].map((n) => scanTier(n * SCAN_TIER_MS).secondsPerSecond), [20, 40, 80, 160, 320]);
    });
    test('the OSD names the level and direction', () => {
        assert.equal(scanLabel(1, scanTier(0)), '⏩ 1×');
        assert.equal(scanLabel(-1, scanTier(SCAN_TIER_MS * 2)), '⏪ 3×');
    });
});

import { seekStep, seekTarget } from '../../shell/src/seek-bar';

describe('Holding ← / → on the progress bar speeds up too', () => {
    test('each step is the 2% step times the level', () => {
        const duration = 6000; // 100 min: 2% = 120 s
        assert.equal(seekStep(duration), 120);
        assert.equal(seekTarget(1000, 1, duration), 1120);
        assert.equal(seekTarget(1000, 1, duration, 3), 1360);
        assert.equal(seekTarget(1000, -1, duration, 5), 400);
        assert.equal(seekTarget(5900, 1, duration, 5), 5999);
    });
});
