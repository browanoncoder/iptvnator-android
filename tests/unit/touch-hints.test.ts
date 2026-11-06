import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { touchHint } from '../../shell/src/touch-hints';

describe('Remote hints read as touch hints on handhelds', () => {
    test('rewrites remote wording for touch', () => {
        assert.equal(touchHint('OK: preview · OK again: fullscreen'), 'Tap: preview · tap again: fullscreen');
        assert.equal(touchHint(' OK: switch channel · Back: close '), 'Tap: switch channel · Back: close');
    });
    test('leaves other text alone', () => {
        assert.equal(touchHint('Choose a category'), undefined);
    });
});
