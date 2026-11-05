import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormFactor, layoutWidth, parseWindowDp, sizeClass, LAYOUT } from '../../shell/src/form-factor';

const win = (width: number, height: number) => ({ width, height });

describe('form factor', () => {
    test('native shell decides TV vs handheld', () => {
        assert.equal(detectFormFactor({ isTelevision: () => true }, true), 'tv');
        assert.equal(detectFormFactor({ isTelevision: () => false }, false), 'handheld');
    });
    test('without the native shell, touch screens are handhelds', () => {
        assert.equal(detectFormFactor(undefined, true), 'handheld');
        assert.equal(detectFormFactor(undefined, false), 'tv');
    });
    test('TV always uses the 1920 layout', () => {
        assert.equal(layoutWidth('tv', win(960, 540)), LAYOUT.tv);
    });
    test('phone portrait and fold cover screen use the compact layout', () => {
        assert.equal(layoutWidth('handheld', win(411, 914)), 600);
        assert.equal(layoutWidth('handheld', win(360, 780)), 600);
    });
    test('phone landscape uses the dense 1280 layout', () => {
        assert.equal(layoutWidth('handheld', win(914, 411)), 1280);
    });
    test('unfolded foldables and tablets lay out at their own width', () => {
        assert.equal(layoutWidth('handheld', win(841, 701)), 841); // Pixel Fold unfolded
        assert.equal(layoutWidth('handheld', win(800, 1280)), 840); // tablet portrait
        assert.equal(layoutWidth('handheld', win(1280, 800)), 1280); // tablet landscape
        assert.equal(layoutWidth('handheld', win(2560, 1600)), 1920); // capped
    });
    test('size classes follow the layout width', () => {
        assert.equal(sizeClass(600), 'compact');
        assert.equal(sizeClass(841), 'medium');
        assert.equal(sizeClass(1280), 'expanded');
    });
    test('window size from the native bridge, with a fallback', () => {
        assert.deepEqual(parseWindowDp('841,701', win(1, 1)), win(841, 701));
        assert.deepEqual(parseWindowDp(undefined, win(400, 800)), win(400, 800));
        assert.deepEqual(parseWindowDp('garbage', win(400, 800)), win(400, 800));
    });
});

import { tabletopFold } from '../../shell/src/posture';

describe('tabletop posture', () => {
    test('accepts a hinge near the middle of the window', () => {
        assert.equal(tabletopFold({ fold: 0.5 }), 0.5);
        assert.equal(tabletopFold({ fold: 0.42 }), 0.42);
    });
    test('ignores flat devices and implausible hinges', () => {
        assert.equal(tabletopFold({ fold: 0 }), 0);
        assert.equal(tabletopFold({ fold: 0.95 }), 0);
        assert.equal(tabletopFold(null), 0);
        assert.equal(tabletopFold({ fold: 'x' }), 0);
    });
});
