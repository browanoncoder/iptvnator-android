/**
 * One gesture vocabulary for the fullscreen player, on the remote and on touch.
 *
 *                     Remote (TV)                     Touch (phone)
 *   play / pause      OK                              —  (client's Pause button)
 *   skip ±10 s        tap ← / →                       double-tap left / right third
 *   scan              hold ← / → (accelerates; also   —
 *                     while the controls are up)
 *   show controls     ↑ (Back hides them again)       tap
 *   faster            Speed button / quick menu       press and hold: 2× while held
 *   quick menu        ↓, Menu, or hold OK             swipe up, or ⋯
 *   zap channel       ↑ / ↓, CH± or ⏭/⏮ on live TV —  (Channels in the quick menu)
 *                     (↑/↓ zap even with the controls up)
 *
 * Remote gestures act only while the client's controls are dormant, so normal
 * focus navigation is untouched whenever the controls are visible; the one
 * exception is a held ← / →, which always scans. A scan
 * previews the target in the OSD and seeks once on release, so holding a key
 * does not flood the provider with range requests.
 */
import { zap, zapDirection } from './channel-zap';
import { hideControls, revealControls, shouldHideOnBack } from './controls-visibility';
import { showOsd } from './osd';
import { applySpeed, currentSpeed } from './playback-speed';
import { isQuickMenuOpen, openQuickMenu } from './quick-menu';
import {
    clampTime,
    clock,
    consume,
    controlsDormant,
    isLivePlayback,
    isOnDemand,
    playerFullscreen,
    signedClock,
    video,
} from './player-dom';

const TAP_SKIP_S = 10;
const DOUBLE_TAP_MS = 300;
const HOLD_MS = 600;
const LONG_PRESS_MS = 450;
const TOUCH_SLOP_PX = 14;
const SWIPE_UP_PX = 70;
const HOLD_SPEED = 2;

interface Scan {
    direction: 1 | -1;
    startedAt: number;
    lastTick: number;
    target: number;
    origin: number;
}

interface Touch {
    x: number;
    y: number;
    timer?: ReturnType<typeof setTimeout>;
    boosted: boolean;
    moved: boolean;
}

let scan: Scan | undefined;
let lastTap = { at: 0, side: 0 };
let enter: { at: number; menu: boolean } | undefined;
let touch: Touch | undefined;

/** Scan rate in seconds of media per second held: 20 s/s, then 60 s/s, then 180 s/s. */
export function scanRate(heldMs: number): number {
    if (heldMs < 1500) return 20;
    if (heldMs < 4000) return 60;
    return 180;
}

/** −1 / +1 for a tap on the left / right third of the screen, 0 for the middle. */
export function tapSide(x: number, width: number): -1 | 0 | 1 {
    const third = width / 3;
    return x < third ? -1 : x > third * 2 ? 1 : 0;
}

export function isSwipeUp(dx: number, dy: number): boolean {
    return dy < -SWIPE_UP_PX && Math.abs(dx) < Math.abs(dy) / 2;
}

function progress(v: HTMLVideoElement): [string, number] {
    return [`${clock(v.currentTime)} / ${clock(v.duration)}`, v.currentTime / v.duration];
}

function showScan(v: HTMLVideoElement, current: Scan): void {
    const icon = current.direction > 0 ? '⏩' : '⏪';
    showOsd(
        `${icon} ${signedClock(current.target - current.origin)}`,
        `${clock(current.target)} / ${clock(v.duration)}`,
        current.target / v.duration
    );
}

function scanStep(v: HTMLVideoElement, direction: 1 | -1, repeat: boolean): void {
    const now = performance.now();
    if (!scan || scan.direction !== direction || !repeat) {
        const origin = v.currentTime;
        scan = { direction, startedAt: now, lastTick: now, origin, target: clampTime(origin + direction * TAP_SKIP_S, v.duration) };
    } else {
        const dt = (now - scan.lastTick) / 1000;
        scan = {
            ...scan,
            lastTick: now,
            target: clampTime(scan.target + direction * scanRate(now - scan.startedAt) * dt, v.duration),
        };
    }
    showScan(v, scan);
}

function commitScan(): void {
    const v = video();
    if (scan && isOnDemand(v)) v.currentTime = scan.target;
    scan = undefined;
}

function togglePlay(v: HTMLVideoElement): void {
    if (v.paused) void v.play();
    else v.pause();
    showOsd(v.paused ? '❚❚ Paused' : '▶ Play', ...progress(v));
}

function scanDirection(event: KeyboardEvent): 1 | -1 | 0 {
    if (event.key === 'ArrowRight' || event.key === 'MediaFastForward') return 1;
    if (event.key === 'ArrowLeft' || event.key === 'MediaRewind') return -1;
    return 0;
}

/** Hold OK for the quick menu; a short press is handled on key-up. */
function onEnterDown(event: KeyboardEvent, onDemand: boolean): void {
    if (!event.repeat) {
        enter = controlsDormant() ? { at: performance.now(), menu: false } : undefined;
        if (enter && onDemand) consume(event);
        return;
    }
    if (!enter) return;
    consume(event);
    if (!enter.menu && performance.now() - enter.at >= HOLD_MS) {
        enter = { ...enter, menu: true };
        openQuickMenu();
    }
}

function onLiveKey(event: KeyboardEvent): void {
    const zapKey = zapDirection(event);
    // ↑/↓ always zap in the fullscreen live player (focus never wanders onto
    // Pause / Back); only an open channel list or guide keeps them.
    if (zapKey && (zapKey.channelKey || controlsDormant() || !document.querySelector('.live-overlay'))) {
        consume(event);
        if (!event.repeat) void zap(zapKey.direction);
    } else if (event.key === 'Enter') {
        onEnterDown(event, false);
    }
}

function onSeekBar(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement && target.type === 'range';
}

function onDemandKey(event: KeyboardEvent, v: HTMLVideoElement): void {
    const direction = scanDirection(event);
    const mediaKey = event.key === 'MediaFastForward' || event.key === 'MediaRewind';
    // Holding ← / → scans even while the controls are up: the first press moves
    // focus as usual, the key's auto-repeat scans. The progress bar keeps its
    // own stepping (seek-bar.ts).
    if (direction !== 0 && event.repeat && !onSeekBar(event.target)) {
        consume(event);
        scanStep(v, direction, !!scan);
        return;
    }
    // Media scan keys work any time; arrows/OK/Up/Down only while the controls are hidden.
    if (!mediaKey && !controlsDormant() && !(event.key === 'Enter' && enter)) return;
    if (direction !== 0) {
        consume(event);
        scanStep(v, direction, event.repeat);
    } else if (event.key === 'Enter') {
        onEnterDown(event, true);
    } else if (event.key === 'ArrowUp' && !event.repeat) {
        consume(event);
        revealControls();
    } else if (event.key === 'ArrowDown' && !event.repeat) {
        consume(event);
        openQuickMenu();
    }
}

function onKeyDown(event: KeyboardEvent): void {
    if (isQuickMenuOpen() || !playerFullscreen()) {
        // Media scan keys still work in the live/preview player.
        const v = video();
        if (!isQuickMenuOpen() && isOnDemand(v) && scanDirection(event) && event.key.startsWith('Media')) {
            consume(event);
            scanStep(v, scanDirection(event) as 1 | -1, event.repeat);
        }
        return;
    }
    if (shouldHideOnBack(event)) {
        consume(event);
        hideControls();
        return;
    }
    if (event.key === 'ContextMenu') {
        consume(event);
        openQuickMenu();
        return;
    }
    if (event.key === 'Guide' && isLivePlayback()) {
        consume(event);
        document.querySelector<HTMLElement>('[data-focus="player-grid"]')?.click();
        return;
    }
    if (isLivePlayback()) {
        onLiveKey(event);
        return;
    }
    const v = video();
    if (isOnDemand(v)) onDemandKey(event, v);
}

function onKeyUp(event: KeyboardEvent): void {
    if (scanDirection(event) !== 0 && scan) {
        consume(event);
        commitScan();
        return;
    }
    if (event.key !== 'Enter' || !enter) return;
    const pressed = enter;
    enter = undefined;
    const v = video();
    if (!pressed.menu && isOnDemand(v)) {
        consume(event);
        togglePlay(v);
    }
}

function isControl(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('button, input, select, a, #android-quick-menu');
}

function onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !playerFullscreen() || isControl(event.target)) return;
    const v = video();
    const state: Touch = { x: event.clientX, y: event.clientY, boosted: false, moved: false };
    if (isOnDemand(v) && !v.paused) {
        state.timer = setTimeout(() => {
            if (!touch || touch.moved) return;
            touch.boosted = true;
            v.playbackRate = HOLD_SPEED;
            showOsd(`${HOLD_SPEED}× ⏩`, 'Release to return to normal speed');
        }, LONG_PRESS_MS);
    }
    touch = state;
}

function onPointerMove(event: PointerEvent): void {
    if (!touch || event.pointerType !== 'touch') return;
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > TOUCH_SLOP_PX) touch.moved = true;
}

function endTouch(): Touch | undefined {
    const ended = touch;
    touch = undefined;
    if (ended?.timer) clearTimeout(ended.timer);
    if (ended?.boosted) {
        const v = video();
        if (v) applySpeed(v);
        showOsd(`${currentSpeed()}×`, 'Normal speed restored');
    }
    return ended;
}

function onPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const ended = endTouch();
    if (!ended || ended.boosted) {
        if (ended?.boosted) consume(event);
        return;
    }
    if (isSwipeUp(event.clientX - ended.x, event.clientY - ended.y)) {
        consume(event);
        openQuickMenu();
        return;
    }
    if (ended.moved) return;
    doubleTap(event);
}

/** YouTube-style double-tap on the left/right third of the screen. */
function doubleTap(event: PointerEvent): void {
    const v = video();
    if (!isOnDemand(v)) return;
    const side = tapSide(event.clientX, window.innerWidth);
    const now = performance.now();
    if (side !== 0 && side === lastTap.side && now - lastTap.at < DOUBLE_TAP_MS) {
        v.currentTime = clampTime(v.currentTime + side * TAP_SKIP_S, v.duration);
        showOsd(side > 0 ? '⏩ +10 s' : '⏪ −10 s', ...progress(v));
        lastTap = { at: 0, side: 0 };
        return;
    }
    lastTap = { at: now, side };
}

function onLoadedMetadata(event: Event): void {
    if (event.target instanceof HTMLVideoElement) applySpeed(event.target);
}

export function installPlayerGestures(): void {
    // Window capture runs before the client's document-level key handlers.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', () => endTouch(), true);
    document.addEventListener('loadedmetadata', onLoadedMetadata, true);
}
