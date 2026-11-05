/**
 * Remote-first playback gestures layered over the TV client's player.
 *
 * Active only for on-demand video (finite duration) while the player's own
 * controls are dormant, so normal focus navigation is untouched whenever the
 * controls are visible:
 *
 *   ← / →  (and ⏪ / ⏩)  tap: skip 10 s · hold: scan, accelerating the longer it is held
 *   OK                   play / pause
 *   ↑                    cycle speed 1× → 1.25× → 1.5× → 2× → 3×
 *   double-tap (touch)   skip 10 s on the tapped side
 *
 * A scan previews the target time in an on-screen display and seeks once on
 * release, so holding a key does not flood the provider with range requests.
 */
import { showOsd } from './osd';

const TAP_SKIP_S = 10;
const SPEEDS = [1, 1.25, 1.5, 2, 3];
const DOUBLE_TAP_MS = 300;

interface Scan {
    direction: 1 | -1;
    startedAt: number;
    lastTick: number;
    target: number;
    origin: number;
}

let scan: Scan | undefined;
let speedIndex = 0;
let lastTap = { at: 0, side: 0 };

function video(): HTMLVideoElement | null {
    return document.querySelector('video');
}

function isOnDemand(v: HTMLVideoElement | null): v is HTMLVideoElement {
    return !!v && Number.isFinite(v.duration) && v.duration > 0;
}

/** The client marks its fullscreen controls `dormant` after a few idle seconds. */
function controlsDormant(): boolean {
    return !!document.querySelector('.player-controls.dormant');
}

function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function signedClock(delta: number): string {
    return `${delta < 0 ? '−' : '+'}${clock(Math.abs(delta))}`;
}

/** Scan rate in seconds of media per second held: 20 s/s, then 60 s/s, then 180 s/s. */
function scanRate(heldMs: number): number {
    if (heldMs < 1500) return 20;
    if (heldMs < 4000) return 60;
    return 180;
}

function clamp(v: HTMLVideoElement, t: number): number {
    return Math.min(Math.max(0, t), Math.max(0, v.duration - 1));
}

function showScan(v: HTMLVideoElement, current: Scan): void {
    const icon = current.direction > 0 ? '⏩' : '⏪';
    const delta = current.target - current.origin;
    showOsd(`${icon} ${signedClock(delta)}`, `${clock(current.target)} / ${clock(v.duration)}`, current.target / v.duration);
}

function scanStep(v: HTMLVideoElement, direction: 1 | -1, repeat: boolean): void {
    const now = performance.now();
    if (!scan || scan.direction !== direction || !repeat) {
        const origin = v.currentTime;
        scan = { direction, startedAt: now, lastTick: now, origin, target: clamp(v, origin + direction * TAP_SKIP_S) };
    } else {
        const dt = (now - scan.lastTick) / 1000;
        scan.target = clamp(v, scan.target + direction * scanRate(now - scan.startedAt) * dt);
        scan.lastTick = now;
    }
    showScan(v, scan);
}

function commitScan(): void {
    const v = video();
    if (scan && isOnDemand(v)) v.currentTime = scan.target;
    scan = undefined;
}

function togglePlay(v: HTMLVideoElement): void {
    if (v.paused) {
        void v.play();
        showOsd('▶ Play', `${clock(v.currentTime)} / ${clock(v.duration)}`, v.currentTime / v.duration);
    } else {
        v.pause();
        showOsd('❚❚ Paused', `${clock(v.currentTime)} / ${clock(v.duration)}`, v.currentTime / v.duration);
    }
}

function cycleSpeed(v: HTMLVideoElement): void {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    v.playbackRate = SPEEDS[speedIndex];
    showOsd(`Speed ${SPEEDS[speedIndex]}×`, speedIndex === 0 ? 'Normal speed' : 'Press ↑ again to change');
}

function scanDirection(event: KeyboardEvent): 1 | -1 | 0 {
    if (event.key === 'ArrowRight' || event.key === 'MediaFastForward') return 1;
    if (event.key === 'ArrowLeft' || event.key === 'MediaRewind') return -1;
    return 0;
}

function consume(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
}

function onKeyDown(event: KeyboardEvent): void {
    const v = video();
    if (!isOnDemand(v)) return;
    const direction = scanDirection(event);
    const mediaKey = event.key === 'MediaFastForward' || event.key === 'MediaRewind';
    // Media scan keys work any time; arrows/OK/Up only while the controls are hidden.
    if (!mediaKey && !controlsDormant()) return;
    if (direction !== 0) {
        consume(event);
        scanStep(v, direction, event.repeat);
    } else if (event.key === 'Enter' && !event.repeat) {
        consume(event);
        togglePlay(v);
    } else if (event.key === 'ArrowUp' && !event.repeat) {
        consume(event);
        cycleSpeed(v);
    }
}

function onKeyUp(event: KeyboardEvent): void {
    if (scanDirection(event) !== 0 && scan) {
        consume(event);
        commitScan();
    }
}

/** YouTube-style double-tap on the left/right third of the screen. */
function onPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const v = video();
    if (!isOnDemand(v)) return;
    const third = window.innerWidth / 3;
    const side = event.clientX < third ? -1 : event.clientX > third * 2 ? 1 : 0;
    const now = performance.now();
    if (side !== 0 && side === lastTap.side && now - lastTap.at < DOUBLE_TAP_MS) {
        v.currentTime = clamp(v, v.currentTime + side * TAP_SKIP_S);
        showOsd(side > 0 ? '⏩ +10 s' : '⏪ −10 s', `${clock(v.currentTime)} / ${clock(v.duration)}`, v.currentTime / v.duration);
        lastTap = { at: 0, side: 0 };
        return;
    }
    lastTap = { at: now, side };
}

/** Keep the chosen speed across episodes; live streams always play at 1×. */
function onLoadedMetadata(event: Event): void {
    const v = event.target;
    if (!(v instanceof HTMLVideoElement)) return;
    v.playbackRate = isOnDemand(v) ? SPEEDS[speedIndex] : 1;
}

export function installPlayerGestures(): void {
    // Window capture runs before the client's document-level key handlers.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('loadedmetadata', onLoadedMetadata, true);
}
