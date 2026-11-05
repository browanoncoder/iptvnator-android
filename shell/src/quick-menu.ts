/**
 * Player quick menu: one bottom sheet with the same actions on TV and phone.
 *
 *   TV     ↓ while the controls are hidden, Menu key, or hold OK
 *   Phone  swipe up on the video, or the ⋯ button
 *
 * On-demand video: speed, jump ±30 s / ±5 min, restart.
 * Live TV: channel list, TV guide, programme.
 * Back, the scrim, or Close dismiss it.
 */
import { showOsd } from './osd';
import { SPEEDS, currentSpeed, setSpeed } from './playback-speed';
import { clampTime, clock, consume, isBackKey, isLivePlayback, isOnDemand, video } from './player-dom';

const ROOT_ID = 'android-quick-menu';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface Action {
    label: string;
    pressed?: boolean;
    run(): void;
}

interface Row {
    title: string;
    actions: Action[];
}

let restoreFocus: HTMLElement | null = null;

/**
 * Spatial navigation: the nearest box whose centre lies in `direction` from
 * `boxes[from]`, weighting off-axis distance so rows are preferred.
 */
export function nextIndex(boxes: Box[], from: number, direction: Direction): number {
    const origin = boxes[from];
    if (!origin) return 0;
    const cx = origin.left + origin.width / 2;
    const cy = origin.top + origin.height / 2;
    let best = from;
    let bestScore = Infinity;
    boxes.forEach((box, index) => {
        if (index === from) return;
        const dx = box.left + box.width / 2 - cx;
        const dy = box.top + box.height / 2 - cy;
        const ahead =
            direction === 'right' ? dx > 1 : direction === 'left' ? dx < -1 : direction === 'down' ? dy > 1 : dy < -1;
        if (!ahead) return;
        const horizontal = direction === 'left' || direction === 'right';
        const score = horizontal ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 0.5;
        if (score < bestScore) {
            bestScore = score;
            best = index;
        }
    });
    return best;
}

export function isQuickMenuOpen(): boolean {
    return !!document.getElementById(ROOT_ID);
}

function clickClient(focus: string): void {
    document.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.click();
}

function jump(seconds: number): Action {
    const label = Math.abs(seconds) >= 60 ? `${Math.abs(seconds) / 60} min` : `${Math.abs(seconds)} s`;
    return {
        label: `${seconds < 0 ? '⏪ −' : '⏩ +'}${label}`,
        run: () => {
            const v = video();
            if (!isOnDemand(v)) return;
            v.currentTime = clampTime(v.currentTime + seconds, v.duration);
            showOsd(seconds < 0 ? '⏪' : '⏩', `${clock(v.currentTime)} / ${clock(v.duration)}`, v.currentTime / v.duration);
        },
    };
}

function onDemandRows(): Row[] {
    const speed = currentSpeed();
    return [
        {
            title: 'Speed',
            actions: SPEEDS.map((rate) => ({
                label: `${rate}×`,
                pressed: rate === speed,
                run: () => {
                    setSpeed(video(), rate);
                    showOsd(`Speed ${rate}×`, rate === 1 ? 'Normal speed' : undefined);
                },
            })),
        },
        { title: 'Jump', actions: [jump(-300), jump(-30), jump(30), jump(300)] },
        {
            title: 'Playback',
            actions: [
                {
                    label: '↺ Start over',
                    run: () => {
                        const v = video();
                        if (v) v.currentTime = 0;
                    },
                },
            ],
        },
    ];
}

function liveRows(): Row[] {
    return [
        {
            title: 'Live TV',
            actions: [
                { label: '☰ Channels', run: () => clickClient('player-channels') },
                { label: '▦ TV Guide', run: () => clickClient('player-grid') },
                { label: '≡ Programme', run: () => clickClient('player-guide') },
            ],
        },
    ];
}

function buttons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll('button'));
}

function render(rows: Row[]): HTMLElement {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = '<div class="qm-scrim"></div>';
    const sheet = document.createElement('div');
    sheet.className = 'qm-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Playback options');
    sheet.setAttribute('data-tv-modal', '');
    for (const row of [...rows, { title: '', actions: [{ label: 'Close', run: () => undefined }] }]) {
        const line = document.createElement('div');
        line.className = 'qm-row';
        if (row.title) {
            const title = document.createElement('span');
            title.className = 'qm-title';
            title.textContent = row.title;
            line.appendChild(title);
        }
        for (const action of row.actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = action.label;
            if (action.pressed !== undefined) button.setAttribute('aria-pressed', String(action.pressed));
            button.addEventListener('click', () => {
                closeQuickMenu();
                action.run();
            });
            line.appendChild(button);
        }
        sheet.appendChild(line);
    }
    root.appendChild(sheet);
    root.querySelector('.qm-scrim')?.addEventListener('click', closeQuickMenu);
    return root;
}

export function openQuickMenu(): void {
    if (isQuickMenuOpen()) return;
    const v = video();
    const rows = isLivePlayback() ? liveRows() : isOnDemand(v) ? onDemandRows() : [];
    if (!rows.length) return;
    restoreFocus = document.activeElement as HTMLElement | null;
    const root = render(rows);
    document.body.appendChild(root);
    const first = root.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? buttons(root)[0];
    first?.focus();
}

export function closeQuickMenu(): void {
    document.getElementById(ROOT_ID)?.remove();
    restoreFocus?.focus?.();
    restoreFocus = null;
}

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** While open, the menu owns the remote: arrows, OK and Back never reach the player. */
function onKeyDown(event: KeyboardEvent): void {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    if (isBackKey(event) || event.key === 'ContextMenu') {
        consume(event);
        closeQuickMenu();
        return;
    }
    const all = buttons(root);
    const current = all.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Enter' || event.key === ' ') {
        consume(event);
        if (!event.repeat) all[Math.max(0, current)]?.click();
        return;
    }
    const direction = ARROWS[event.key];
    if (!direction) return;
    consume(event);
    const boxes = all.map((b) => b.getBoundingClientRect());
    all[nextIndex(boxes, Math.max(0, current), direction)]?.focus();
}

export function installQuickMenu(): void {
    // Registered before the gesture handlers so an open menu always wins.
    window.addEventListener('keydown', onKeyDown, true);
}
