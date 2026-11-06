/**
 * Tracks whether the fullscreen player is up and reflects it on <html> as
 * `player-active`, so the shell's chrome (menu button, ⋯ button) hides and
 * shows with the player. On phones, fullscreen playback turns to landscape
 * (and back) the way dedicated video apps do.
 */
import type { FormFactor } from './form-factor';
import { closeQuickMenu, openQuickMenu } from './quick-menu';
import { playerFullscreen } from './player-dom';

export const PLAYER_ACTIVE = 'player-active';

interface NativeShell {
    setPlayerLandscape?(on: boolean): void;
}

function shell(): NativeShell | undefined {
    return (window as unknown as { IptvnatorAndroid?: NativeShell }).IptvnatorAndroid;
}

function moreButton(): HTMLButtonElement {
    const more = document.createElement('button');
    more.id = 'android-more';
    more.type = 'button';
    more.textContent = '⋯';
    more.setAttribute('aria-label', 'Playback options');
    more.addEventListener('click', openQuickMenu);
    return more;
}

export function installPlayerState(formFactor: FormFactor): void {
    const root = document.documentElement;
    document.body.appendChild(moreButton());
    let active = false;
    const update = () => {
        const now = playerFullscreen();
        if (now === active) return;
        active = now;
        root.classList.toggle(PLAYER_ACTIVE, now);
        if (!now) closeQuickMenu();
        if (formFactor === 'handheld') shell()?.setPlayerLandscape?.(now);
    };
    new MutationObserver(update).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
    });
}
