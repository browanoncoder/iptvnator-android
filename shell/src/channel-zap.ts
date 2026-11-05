/**
 * Channel zapping in the fullscreen live player: ↑ / ↓ (while the controls
 * are hidden) or CH+ / CH− switch to the neighbouring channel of the current
 * category without opening any list.
 *
 * It drives the client's own channel drawer invisibly (open → pick the
 * neighbour → close), so playback, history and EPG stay owned by the client.
 */
import { showOsd } from './osd';
import { playerFullscreen } from './player-dom';

const DRAWER_TIMEOUT_MS = 2500;
const ZAPPING_CLASS = 'zapping';

export type ZapDirection = 1 | -1;

export interface ChannelEntry {
    playing: boolean;
}

/** Index of the channel to switch to, or -1 at either end of the list. */
export function neighbourIndex(channels: ChannelEntry[], direction: ZapDirection): number {
    const current = channels.findIndex((c) => c.playing);
    if (current < 0) return -1;
    const next = current + direction;
    return next >= 0 && next < channels.length ? next : -1;
}

/** CH+/CH− always zap; ↑/↓ zap only while the player controls are hidden. */
export function zapDirection(event: Pick<KeyboardEvent, 'key' | 'keyCode'>): { direction: ZapDirection; channelKey: boolean } | undefined {
    switch (event.key) {
        case 'ChannelUp':
        case 'PageUp':
            return { direction: 1, channelKey: true };
        case 'ChannelDown':
        case 'PageDown':
            return { direction: -1, channelKey: true };
        case 'ArrowDown':
            return { direction: 1, channelKey: false };
        case 'ArrowUp':
            return { direction: -1, channelKey: false };
    }
    // webOS / some Android remotes report only the key code.
    if (event.keyCode === 427) return { direction: 1, channelKey: true };
    if (event.keyCode === 428) return { direction: -1, channelKey: true };
    return undefined;
}

function waitFor<T>(probe: () => T | null | undefined, timeoutMs: number): Promise<T | undefined> {
    return new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs;
        const tick = () => {
            const value = probe();
            if (value) resolve(value);
            else if (performance.now() > deadline) resolve(undefined);
            else requestAnimationFrame(tick);
        };
        tick();
    });
}

function drawerChannels(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.live-overlay .channel'));
}

let busy = false;

export async function zap(direction: ZapDirection): Promise<void> {
    if (busy) return;
    const opener = document.querySelector<HTMLElement>('[data-focus="player-channels"]');
    if (!opener) return;
    busy = true;
    const root = document.documentElement;
    root.classList.add(ZAPPING_CLASS);
    try {
        opener.click();
        const channels = await waitFor(() => {
            const list = drawerChannels();
            return list.length ? list : undefined;
        }, DRAWER_TIMEOUT_MS);
        if (!channels) return;
        const entries = channels.map((b) => ({
            playing: b.classList.contains('is-playing') || b.getAttribute('aria-pressed') === 'true',
        }));
        const index = neighbourIndex(entries, direction);
        const target = channels[index];
        if (!target) {
            showOsd(direction > 0 ? 'Last channel' : 'First channel', 'in this category');
            return;
        }
        const number = target.querySelector('.channel-number')?.textContent?.trim() ?? '';
        const title = target.querySelector('strong')?.textContent?.trim() ?? '';
        target.click();
        showOsd(`${direction > 0 ? '▲' : '▼'} ${number}`, title);
        // Picking from the drawer returns the client to the preview player;
        // put the new channel straight back into fullscreen.
        const reopen = await waitFor(
            () => (playerFullscreen() ? undefined : document.querySelector<HTMLElement>('[data-focus="live-fullscreen"]')),
            DRAWER_TIMEOUT_MS
        );
        reopen?.click();
        await waitFor(() => playerFullscreen() || undefined, DRAWER_TIMEOUT_MS);
    } finally {
        document.querySelector<HTMLElement>('.live-overlay [data-focus="channels-close"]')?.click();
        root.classList.remove(ZAPPING_CLASS);
        busy = false;
    }
}
