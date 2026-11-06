/**
 * A visible Speed button in the player's control row, next to −10 / +10 sec.
 *
 * Remote shortcuts (↑ while the controls are hidden, the quick menu) are fast
 * but invisible. Once someone presses OK the controls appear and ↑ moves
 * focus instead, so speed seemed "not to work". A real button in the row
 * works the same with OK on a remote and with a tap on touch screens.
 */
import { showOsd } from './osd';
import { currentSpeed, nextSpeed, setSpeed } from './playback-speed';
import { isLivePlayback, isOnDemand, video } from './player-dom';

export const SPEED_BUTTON_ID = 'android-speed';

export function speedLabel(rate: number): string {
    return `${rate}× speed`;
}

/**
 * The client draws −10 / +10 sec only for movies and episodes. Placing the
 * button as soon as they appear (not when the duration loads, ~1 s later)
 * keeps the row from re-wrapping under the viewer on narrower screens.
 */
export function wantsSpeedButton(labels: readonly string[], onDemand: boolean): boolean {
    return onDemand || labels.some((label) => /^\+10\b/.test(label.trim()));
}

function rowLabels(actions: Element): string[] {
    return Array.from(actions.querySelectorAll('button')).map((b) => b.textContent ?? '');
}

function refresh(button: HTMLButtonElement): void {
    const label = speedLabel(currentSpeed());
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-pressed', String(currentSpeed() !== 1));
}

function createButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = SPEED_BUTTON_ID;
    button.type = 'button';
    button.addEventListener('click', () => {
        if (isLivePlayback()) return;
        const v = video();
        const rate = nextSpeed(currentSpeed());
        setSpeed(v, rate);
        refresh(button);
        const again = document.documentElement.classList.contains('form-tv') ? 'OK' : 'Tap';
        showOsd(`Speed ${rate}×`, rate === 1 ? 'Normal speed' : `${again} again for faster`);
    });
    refresh(button);
    return button;
}

/** Place the button after "+10 sec", or at the end of the row. */
function place(actions: Element, button: HTMLButtonElement): void {
    const plus = Array.from(actions.querySelectorAll('button')).find((b) => /\+10/.test(b.textContent ?? ''));
    const anchor = plus?.nextElementSibling ?? null;
    if (button.parentElement === actions && button.previousElementSibling === plus) return;
    actions.insertBefore(button, plus ? anchor : null);
}

export function installSpeedButton(): void {
    const button = createButton();
    let queued = false;
    const sync = () => {
        queued = false;
        const actions = document.querySelector('.player-bottom .actions');
        if (actions && !isLivePlayback() && wantsSpeedButton(rowLabels(actions), isOnDemand(video()))) {
            place(actions, button);
            refresh(button);
        } else if (button.isConnected) {
            button.remove();
        }
    };
    // Re-place after every client re-render (the row is rebuilt per item).
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(sync);
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('ratechange', () => refresh(button), true);
    // The row can be rendered before the duration is known, and after that only
    // text changes; media events (capture: they don't bubble) place it then.
    for (const type of ['loadedmetadata', 'durationchange', 'playing']) {
        document.addEventListener(type, () => requestAnimationFrame(sync), true);
    }
    document.addEventListener('timeupdate', () => {
        if (!button.isConnected) sync();
    }, true);
}
