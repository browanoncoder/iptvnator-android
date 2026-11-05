import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createExitGuard, EXIT_WINDOW_MS } from '../../shell/src/exit-guard';

describe('Back on Home asks before leaving the app', () => {
    test('the first Back only warns', () => {
        const guard = createExitGuard();
        assert.equal(guard(1000), 'warn');
    });

    test('a second Back within the window exits', () => {
        const guard = createExitGuard();
        guard(1000);
        assert.equal(guard(1000 + EXIT_WINDOW_MS - 1), 'exit');
    });

    test('a late second Back warns again instead of exiting', () => {
        const guard = createExitGuard();
        guard(1000);
        assert.equal(guard(1000 + EXIT_WINDOW_MS + 1), 'warn');
        assert.equal(guard(1000 + EXIT_WINDOW_MS + 500), 'exit');
    });

    test('after exiting, the next Back warns again (app resumed later)', () => {
        const guard = createExitGuard();
        guard(0);
        guard(100);
        assert.equal(guard(200), 'warn');
    });
});
