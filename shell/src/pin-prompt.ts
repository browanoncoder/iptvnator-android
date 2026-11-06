/**
 * PIN pad for password-protected channels (channel-lock.ts).
 *
 * Remote: digit keys type, ← ↑ → ↓ move over the pad, OK presses, Back cancels.
 * Touch: tap the digits. Four digits are checked straight away; a wrong PIN
 * clears the dots and says so, and five wrong tries pause input for 30 s.
 */
const PIN_LENGTH = 4;
const MAX_TRIES = 5;
const PAUSE_MS = 30_000;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'cancel'] as const;
const COLUMNS = 3;

interface Open {
    readonly root: HTMLElement;
    readonly check: (pin: string) => boolean;
    readonly done: (ok: boolean) => void;
    readonly restoreFocus: Element | null;
    entered: string;
    tries: number;
    pausedUntil: number;
}

let open: Open | undefined;

/** Next pad index for an arrow key on a 3-column grid (stays inside the pad). */
export function padMove(index: number, key: string, count: number = KEYS.length): number {
    const row = Math.floor(index / COLUMNS);
    const col = index % COLUMNS;
    const rows = Math.ceil(count / COLUMNS);
    if (key === 'ArrowLeft') return row * COLUMNS + Math.max(0, col - 1);
    if (key === 'ArrowRight') return Math.min(count - 1, row * COLUMNS + Math.min(COLUMNS - 1, col + 1));
    if (key === 'ArrowUp') return Math.max(0, row - 1) * COLUMNS + col;
    if (key === 'ArrowDown') return Math.min(rows - 1, row + 1) * COLUMNS + col;
    return index;
}

function label(key: (typeof KEYS)[number]): string {
    if (key === 'back') return '⌫';
    if (key === 'cancel') return 'Cancel';
    return key;
}

function render(state: Open, message?: string): void {
    const dots = state.root.querySelector('.pin-dots');
    if (dots) dots.textContent = '●'.repeat(state.entered.length) + '○'.repeat(PIN_LENGTH - state.entered.length);
    const note = state.root.querySelector('.pin-note');
    if (note && message !== undefined) note.textContent = message;
}

function close(ok: boolean): void {
    const state = open;
    if (!state) return;
    open = undefined;
    state.root.remove();
    (state.restoreFocus as HTMLElement | null)?.focus?.();
    state.done(ok);
}

function press(key: string): void {
    const state = open;
    if (!state) return;
    if (key === 'cancel') return close(false);
    if (Date.now() < state.pausedUntil) {
        render(state, 'Too many tries. Wait a moment, then try again.');
        return;
    }
    if (key === 'back') {
        state.entered = state.entered.slice(0, -1);
        return render(state, '');
    }
    if (!/^\d$/.test(key) || state.entered.length >= PIN_LENGTH) return;
    state.entered += key;
    render(state, '');
    if (state.entered.length < PIN_LENGTH) return;
    if (state.check(state.entered)) return close(true);
    state.tries += 1;
    state.entered = '';
    state.root.querySelector('.pin-sheet')?.classList.remove('pin-wrong');
    void (state.root.querySelector('.pin-sheet') as HTMLElement | null)?.offsetWidth;
    state.root.querySelector('.pin-sheet')?.classList.add('pin-wrong');
    if (state.tries >= MAX_TRIES) {
        state.tries = 0;
        state.pausedUntil = Date.now() + PAUSE_MS;
        return render(state, 'Too many tries. Wait 30 seconds, then try again.');
    }
    render(state, 'Wrong PIN. Try again.');
}

function build(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'android-pin';
    root.innerHTML = `
        <div class="pin-scrim"></div>
        <div class="pin-sheet" role="dialog" aria-modal="true" aria-labelledby="android-pin-title">
            <h2 id="android-pin-title">🔒 Locked channel</h2>
            <p>Enter the parental PIN to watch.</p>
            <div class="pin-dots" aria-hidden="true"></div>
            <p class="pin-note" role="status" aria-live="polite"></p>
            <div class="pin-pad"></div>
        </div>`;
    const pad = root.querySelector('.pin-pad')!;
    for (const key of KEYS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset['key'] = key;
        button.textContent = label(key);
        if (key === 'back') button.setAttribute('aria-label', 'Delete last digit');
        button.addEventListener('click', () => press(key));
        pad.appendChild(button);
    }
    root.querySelector('.pin-scrim')?.addEventListener('click', () => close(false));
    return root;
}

function onKeyDown(event: KeyboardEvent): void {
    if (!open) return;
    // The prompt owns every key while it is up (digits would otherwise seek).
    event.preventDefault();
    event.stopImmediatePropagation();
    const buttons = [...open.root.querySelectorAll<HTMLButtonElement>('.pin-pad button')];
    const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    if (/^\d$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace') press('back');
    else if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GoBack') close(false);
    else if (event.key === 'Enter') buttons[index]?.click();
    else if (event.key.startsWith('Arrow')) buttons[padMove(index, event.key)]?.focus();
}

/** Shows the PIN pad; resolves true once a PIN passes `check`, false when cancelled. */
export function requestPin(check: (pin: string) => boolean, signal?: AbortSignal): Promise<boolean> {
    if (open) close(false);
    return new Promise((resolve) => {
        const root = build();
        open = { root, check, done: resolve, restoreFocus: document.activeElement, entered: '', tries: 0, pausedUntil: 0 };
        document.body.appendChild(root);
        render(open, '');
        root.querySelector<HTMLButtonElement>('.pin-pad button')?.focus();
        signal?.addEventListener('abort', () => close(false), { once: true });
    });
}

export function isPinPromptOpen(): boolean {
    return !!open;
}

export const PIN_CSS = `
#android-pin { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; }
#android-pin .pin-scrim { position: absolute; inset: 0; background: rgba(0,0,0,.7); }
#android-pin .pin-sheet {
  position: relative; width: min(440px, calc(100vw - 32px)); padding: 28px 28px 24px; border-radius: 20px;
  background: #0f1513; color: #eef4f0; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.6);
}
#android-pin h2 { margin: 0 0 6px; font-size: 28px; }
#android-pin p { margin: 0; color: #b8c7bf; font-size: 18px; }
#android-pin .pin-dots { margin: 20px 0 6px; font-size: 34px; letter-spacing: 14px; color: var(--tv-accent, #7fe0c4); }
#android-pin .pin-note { min-height: 24px; margin-bottom: 12px; color: #ffb4a8; font-size: 16px; }
#android-pin .pin-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
#android-pin .pin-pad button {
  display: flex; align-items: center; justify-content: center; text-align: center; margin: 0; padding: 0;
  min-height: 64px; border-radius: 14px; border: 0; background: #1b2522; color: inherit; font-size: 26px;
}
#android-pin .pin-pad button[data-key='cancel'] { font-size: 18px; }
#android-pin .pin-pad button:focus { outline: 3px solid var(--tv-accent, #7fe0c4); outline-offset: 2px; }
.form-handheld #android-pin .pin-pad button:focus:not(:focus-visible) { outline: none; }
#android-pin .pin-wrong { animation: android-pin-shake .35s; }
@keyframes android-pin-shake { 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }
`;

export function installPinPrompt(): void {
    // Registered before the other shell key handlers, so the pad sees keys first.
    window.addEventListener('keydown', onKeyDown, true);
    const style = document.createElement('style');
    style.textContent = PIN_CSS;
    document.head.appendChild(style);
}
