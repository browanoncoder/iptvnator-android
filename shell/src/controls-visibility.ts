/**
 * Show / hide the fullscreen player controls from the remote, on top of the
 * client's own idle timer (it hides them after 5 s and shows them on any key).
 *
 * - Back while the controls are up hides them at once (a second Back leaves
 *   the player, as before).
 * - ↑ while they are hidden brings them back (see player-gestures.ts).
 *
 * Hiding is a class on <html> that looks exactly like the client's `dormant`
 * state; controlsDormant() honours it, so remote gestures behave the same.
 */
import { CONTROLS_HIDDEN, isBackKey, playerFullscreen } from './player-dom';

function root(): HTMLElement {
    return document.documentElement;
}

export function hideControls(): void {
    root().classList.add(CONTROLS_HIDDEN);
}

/** The client reveals its controls on pointer movement; reuse that path. */
export function revealControls(): void {
    root().classList.remove(CONTROLS_HIDDEN);
    document.dispatchEvent(new MouseEvent('mousemove'));
}

/** Back hides visible controls only when nothing else (a panel, an error) owns Back. */
export function shouldHideOnBack(event: KeyboardEvent): boolean {
    if (!isBackKey(event) || !playerFullscreen()) return false;
    if (root().classList.contains(CONTROLS_HIDDEN)) return false;
    const controls = document.querySelector('.player-controls');
    return (
        !!controls &&
        !controls.classList.contains('dormant') &&
        !controls.hasAttribute('hidden') &&
        !document.querySelector('.live-overlay, .player-bottom [role="alert"], #android-quick-menu')
    );
}

export function installControlsVisibility(): void {
    // Any key the shell lets through reaches the client, which shows its controls.
    document.addEventListener('keydown', () => root().classList.remove(CONTROLS_HIDDEN), true);
    new MutationObserver(() => {
        const dormant = !!document.querySelector('.player-controls.dormant');
        if (dormant || !playerFullscreen()) root().classList.remove(CONTROLS_HIDDEN);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
}
