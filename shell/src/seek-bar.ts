/**
 * Makes the client's "Playback position" slider usable with a remote.
 *
 * A native range input moves one step (1 s) per ← / → press, so reaching the
 * middle of a movie from the remote was impractical. While the slider has
 * focus, each press moves 2% of the title (10 s – 5 min), holding repeats, and
 * an OSD shows where playback will land. The seek goes through the client's
 * own `input` handler, so its state stays authoritative.
 */
import { showOsd } from './osd';
import { clampTime, clock, isOnDemand, video } from './player-dom';

const STEP_FRACTION = 0.02;
const MIN_STEP_S = 10;
const MAX_STEP_S = 300;
const REPEAT_MS = 120;
const SLIDER = '.player-bottom .seek input[type="range"], .seek input[type="range"]';

export function seekStep(duration: number): number {
    return Math.min(MAX_STEP_S, Math.max(MIN_STEP_S, Math.round(duration * STEP_FRACTION * 100) / 100));
}

export function seekTarget(from: number, direction: 1 | -1, duration: number): number {
    return clampTime(from + direction * seekStep(duration), duration);
}

let lastStep = 0;

function onKey(event: KeyboardEvent): void {
    const slider = event.target instanceof HTMLInputElement && event.target.matches(SLIDER) ? event.target : null;
    if (!slider || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    const v = video();
    if (!isOnDemand(v)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Holding repeats at a readable pace (about 16% of the title per second).
    const now = performance.now();
    if (event.repeat && now - lastStep < REPEAT_MS) return;
    lastStep = now;
    // Rapid presses build on the slider's pending value, not the lagging video.
    const from = Number(slider.value) || v.currentTime;
    const target = seekTarget(from, event.key === 'ArrowRight' ? 1 : -1, v.duration);
    slider.value = String(target);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const percent = Math.round((target / v.duration) * 100);
    showOsd(`${percent}%`, `${clock(target)} / ${clock(v.duration)}`, target / v.duration);
}

export function installSeekBar(): void {
    document.addEventListener('keydown', onKey, true);
}
