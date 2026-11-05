/**
 * One navigation model on every screen: a slim icon rail that slides open
 * with labels.
 *
 *   TV      the rail opens when focus moves into it (← from the content) and
 *           closes as soon as focus leaves, like the Google TV side menu.
 *   Phone   the ☰ button opens it over a scrim; choosing a destination,
 *           tapping the scrim, swiping left or Back closes it.
 *
 * There is deliberately no left-edge swipe to open: on Android that edge is
 * the system Back gesture.
 */
import type { FormFactor } from './form-factor';
import { consume, isBackKey } from './player-dom';

export const DRAWER_OPEN = 'drawer-open';
const SWIPE_CLOSE_PX = 60;

const MENU_ICON =
    '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function setOpen(open: boolean, menu: HTMLElement): void {
    document.documentElement.classList.toggle(DRAWER_OPEN, open);
    menu.setAttribute('aria-expanded', String(open));
}

function isOpen(): boolean {
    return document.documentElement.classList.contains(DRAWER_OPEN);
}

function inRail(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('aside');
}

const SETTLE_DELAY_MS = 250;
const STARTUP_TIMEOUT_MS = 15000;

function firstContentControl(): HTMLElement | undefined {
    return Array.from(document.querySelectorAll<HTMLElement>('main button:not(:disabled), main input, main [data-tv-scroll]')).find(
        (element) => element.offsetWidth > 0 && !element.closest('[hidden]')
    );
}

/**
 * After a destination is chosen, focus moves into the page and the rail slides
 * shut, so the page you picked is never hidden behind the open rail.
 */
function settleIntoContent(): void {
    setTimeout(() => {
        if (!inRail(document.activeElement)) return;
        firstContentControl()?.focus({ preventScroll: true });
    }, SETTLE_DELAY_MS);
}

/** Start in the content, not the rail, once the first page has rendered. */
function settleAtStartup(): void {
    const started = performance.now();
    const tick = () => {
        const target = firstContentControl();
        const idle = document.activeElement === document.body || inRail(document.activeElement);
        if (target && idle) target.focus({ preventScroll: true });
        else if (!target && performance.now() - started < STARTUP_TIMEOUT_MS) setTimeout(tick, 200);
    };
    tick();
}

function currentNavButton(): HTMLElement | null {
    return document.querySelector<HTMLElement>('aside nav button[aria-current="page"], aside nav button');
}

function installTv(menu: HTMLElement): void {
    document.addEventListener('focusin', (event) => {
        // The ☰ cue is never a D-pad stop: focus parked there would close the
        // rail and leave a clipped focus ring at the screen edge.
        if (event.target === menu) {
            currentNavButton()?.focus({ preventScroll: true });
            return;
        }
        setOpen(inRail(event.target), menu);
    });
    document.addEventListener(
        'click',
        (event) => {
            if (event.target instanceof Element && event.target.closest('aside nav button')) settleIntoContent();
        },
        true
    );
    settleAtStartup();
}

function installHandheld(menu: HTMLElement, scrim: HTMLElement): void {
    const close = () => setOpen(false, menu);
    menu.addEventListener('click', () => setOpen(!isOpen(), menu));
    scrim.addEventListener('click', close);
    // Choosing a destination closes the drawer.
    document.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('aside nav button')) close();
    }, true);
    window.addEventListener('keydown', (event) => {
        if (isOpen() && isBackKey(event)) {
            consume(event);
            close();
        }
    }, true);
    let startX: number | undefined;
    window.addEventListener('touchstart', (event) => {
        startX = isOpen() ? event.touches[0]?.clientX : undefined;
    }, { passive: true });
    window.addEventListener('touchend', (event) => {
        const endX = event.changedTouches[0]?.clientX;
        if (startX !== undefined && endX !== undefined && endX - startX < -SWIPE_CLOSE_PX) close();
        startX = undefined;
    }, { passive: true });
}

export function installNavRail(formFactor: FormFactor): void {
    const menu = document.createElement('button');
    menu.id = 'android-menu';
    menu.type = 'button';
    menu.innerHTML = MENU_ICON;
    menu.setAttribute('aria-label', 'Menu');
    menu.setAttribute('aria-expanded', 'false');
    const scrim = document.createElement('div');
    scrim.id = 'android-scrim';
    if (formFactor === 'tv') {
        // On TV the icon is a visual cue only; focus reaches the rail with ←.
        // inert keeps the client's spatial navigation from ever landing on it.
        menu.tabIndex = -1;
        menu.inert = true;
        menu.setAttribute('aria-hidden', 'true');
        installTv(menu);
    } else {
        installHandheld(menu, scrim);
    }
    document.body.append(scrim, menu);
}
