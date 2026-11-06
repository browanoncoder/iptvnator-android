/**
 * Back on Home used to leave the app at once, so one press too many while
 * backing out of a page dropped the viewer on the launcher. Now the first
 * press shows "Press Back again to exit" and only a second press within
 * EXIT_WINDOW_MS leaves.
 */
export const EXIT_WINDOW_MS = 2000;

export type ExitDecision = 'warn' | 'exit';

/** Returns a function that decides, for a Back press at `now` (ms), whether to warn or exit. */
export function createExitGuard(windowMs: number = EXIT_WINDOW_MS): (now: number) => ExitDecision {
    let warnedAt: number | undefined;
    return (now) => {
        if (warnedAt !== undefined && now - warnedAt < windowMs) {
            warnedAt = undefined;
            return 'exit';
        }
        warnedAt = now;
        return 'warn';
    };
}
