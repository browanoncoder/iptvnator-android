/**
 * The rest of the remote's buttons in the fullscreen player:
 *
 *   0 – 9            jump to 0 %, 10 % … 90 % of a movie or episode
 *   Mute             mute / unmute the player (when the remote sends it to apps)
 *   Captions         subtitles on / off, when the stream has any
 *   Audio            next audio track, when the stream has several
 *   Info             show the controls
 *
 * Volume and the TV's own mute stay with Android, which shows its volume UI.
 */
import { revealControls } from './controls-visibility';
import { showOsd } from './osd';
import { clampTime, clock, consume, isOnDemand, playerFullscreen, video } from './player-dom';
import { isQuickMenuOpen } from './quick-menu';

const MUTE_KEYS = new Set(['AudioVolumeMute', 'MicrophoneVolumeMute', 'VolumeMute']);

export function digitTarget(key: string, duration: number): number | undefined {
    if (!/^[0-9]$/.test(key)) return undefined;
    return clampTime((Number(key) / 10) * duration, duration);
}

function jumpToDigit(v: HTMLVideoElement, key: string): void {
    const target = digitTarget(key, v.duration);
    if (target === undefined) return;
    v.currentTime = target;
    showOsd(`${Number(key) * 10}%`, `${clock(target)} / ${clock(v.duration)}`, target / v.duration);
}

function toggleMute(v: HTMLVideoElement): void {
    v.muted = !v.muted;
    showOsd(v.muted ? '🔇 Muted' : '🔊 Sound on', v.muted ? 'Press Mute again for sound' : undefined);
}

function toggleCaptions(v: HTMLVideoElement): void {
    const tracks = Array.from(v.textTracks ?? []).filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
    if (!tracks.length) {
        showOsd('No subtitles', 'This stream has no subtitle track');
        return;
    }
    const showing = tracks.findIndex((t) => t.mode === 'showing');
    tracks.forEach((t) => (t.mode = 'disabled'));
    const next = showing + 1 < tracks.length ? tracks[showing + 1] : undefined;
    if (next) next.mode = 'showing';
    showOsd(next ? `Subtitles: ${next.label || next.language || 'on'}` : 'Subtitles off');
}

interface AudioTrackLike {
    enabled: boolean;
    label: string;
    language: string;
}

function nextAudioTrack(v: HTMLVideoElement): void {
    const list = (v as HTMLVideoElement & { audioTracks?: ArrayLike<AudioTrackLike> }).audioTracks;
    const tracks = list ? Array.from(list) : [];
    if (tracks.length < 2) {
        showOsd('One audio track', 'This stream has no other languages');
        return;
    }
    const current = Math.max(0, tracks.findIndex((t) => t.enabled));
    const next = tracks[(current + 1) % tracks.length];
    tracks.forEach((t) => (t.enabled = t === next));
    showOsd(`Audio: ${next.label || next.language || 'track ' + ((current + 1) % tracks.length + 1)}`);
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || isQuickMenuOpen() || !playerFullscreen()) return;
    const v = video();
    if (!v) return;
    if (MUTE_KEYS.has(event.key)) {
        consume(event);
        toggleMute(v);
    } else if (event.key === 'ClosedCaptionToggle' || event.key === 'Subtitle') {
        consume(event);
        toggleCaptions(v);
    } else if (event.key === 'MediaAudioTrack') {
        consume(event);
        nextAudioTrack(v);
    } else if (event.key === 'Info') {
        consume(event);
        revealControls();
    } else if (isOnDemand(v) && digitTarget(event.key, v.duration) !== undefined) {
        consume(event);
        jumpToDigit(v, event.key);
    }
}

export function installRemoteKeys(): void {
    window.addEventListener('keydown', onKeyDown, true);
}
