/** Read-only queries over the TV client's player DOM, shared by the shell modules. */

type Queryable = Pick<Document, 'querySelector'>;

export function video(doc: Queryable = document): HTMLVideoElement | null {
    return doc.querySelector('video');
}

/**
 * Live is decided by the client, not the stream: some providers serve live
 * channels as finite files. The client renders a Channels button in the
 * fullscreen player, and the live page, only for live playback.
 */
export function isLivePlayback(doc: Queryable = document): boolean {
    return !!doc.querySelector('[data-focus="player-channels"], main.live-page');
}

export function isOnDemand(v: HTMLVideoElement | null, doc: Queryable = document): v is HTMLVideoElement {
    return !!v && Number.isFinite(v.duration) && v.duration > 0 && !isLivePlayback(doc);
}

/** <html> class set when the shell hides the controls early (Back). */
export const CONTROLS_HIDDEN = 'controls-hidden';

/** The client marks its fullscreen controls `dormant` after a few idle seconds. */
export function controlsDormant(doc: Queryable = document): boolean {
    const root = (doc as Partial<Document>).documentElement;
    return !!doc.querySelector('.player-controls.dormant') || !!root?.classList.contains(CONTROLS_HIDDEN);
}

export function playerFullscreen(doc: Queryable = document): boolean {
    const player = doc.querySelector('.native-player.fullscreen') as HTMLElement | null;
    return !!player && !player.hidden;
}

export function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function signedClock(delta: number): string {
    return `${delta < 0 ? '−' : '+'}${clock(Math.abs(delta))}`;
}

export function clampTime(t: number, duration: number): number {
    return Math.min(Math.max(0, t), Math.max(0, duration - 1));
}

export function consume(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
}

export function isBackKey(event: KeyboardEvent): boolean {
    return event.keyCode === 461 || ['Escape', 'BrowserBack', 'GoBack', 'Backspace'].includes(event.key);
}
