/**
 * Makes the client's "Playback position" slider usable with a remote.
 *
 * A native range input moves one step (1 s) per ← / → press, so reaching the
 * middle of a movie from the remote was impractical. While the slider has
 * focus, each press moves 2% of the title (10 s – 5 min); holding repeats and
 * speeds up 1× → 5× like the fullscreen scan (scan-speed.ts), and an OSD shows
 * where playback will land. The seek goes through the client's
 * own `input` handler, so its state stays authoritative.
 */
import { showOsd } from './osd';
import { clampTime, clock, isOnDemand, video } from './player-dom';
import { scanLabel, scanTier } from './scan-speed';

const STEP_FRACTION = 0.02;
const MIN_STEP_S = 10;
const MAX_STEP_S = 300;
const REPEAT_MS = 120;
const SLIDER = '.player-bottom .seek input[type="range"], .seek input[type="range"]';

export function seekStep(duration: number): number {
    return Math.min(MAX_STEP_S, Math.max(MIN_STEP_S, Math.round(duration * STEP_FRACTION * 100) / 100));
}

export function seekTarget(from: number, direction: 1 | -1, duration: number, level = 1): number {
    return clampTime(from + direction * seekStep(duration) * level, duration);
}

let lastStep = 0;
/** When the current hold began (a fresh press resets it). */
let holdStart = 0;
/** The target of the last press: rapid presses build on it, not on a lagging slider or video. */
let pending: { target: number; at: number } | undefined;
const PENDING_MS = 1500;

function onKey(event: KeyboardEvent): void {
    const slider = event.target instanceof HTMLInputElement && event.target.matches(SLIDER) ? event.target : null;
    if (!slider || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const v = video();
    if (!isOnDemand(v)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Holding repeats at a readable pace (about 16% of the title per second).
    const now = performance.now();
    if (!event.repeat) holdStart = now;
    if (event.repeat && now - lastStep < REPEAT_MS) return;
    lastStep = now;
    // Rapid presses build on the previous target; otherwise start from the
    // video itself (the slider's value can lag behind it).
    const from = pending && now - pending.at < PENDING_MS ? pending.target : v.currentTime;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const tier = scanTier(event.repeat ? now - holdStart : 0);
    const target = seekTarget(from, direction, v.duration, tier.level);
    pending = { target, at: now };
    slider.value = String(target);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const percent = Math.round((target / v.duration) * 100);
    showOsd(event.repeat ? `${percent}%  ${scanLabel(direction, tier)}` : `${percent}%`, `${clock(target)} / ${clock(v.duration)}`, target / v.duration);
}

export function installSeekBar(): void {
    document.addEventListener('keydown', onKey, true);
}
