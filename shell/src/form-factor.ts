/**
 * One APK for every screen: TV, phone, foldable and tablet.
 *
 * The TV client is styled in CSS pixels for a 1920x1080 television and ships
 * compact breakpoints (<=1400px, <=900px). The shell picks the layout viewport
 * from the window size (Android window size classes), so those breakpoints
 * serve every device instead of forking the UI:
 *
 *   television                         1920 (the layout the client was designed for)
 *   compact width  (<600dp: phone, fold cover screen)        600 (<=900 breakpoint)
 *   compact height (<480dp: phone in landscape)              1280 (<=1400 breakpoint)
 *   medium/expanded (unfolded foldable, tablet)  window width, at least 840, at native scale
 *
 * The layout is recomputed whenever the window changes: rotating, folding,
 * unfolding or resizing in multi-window.
 */
import { ANDROID_CSS } from './android-css';
import { POLISH_CSS } from './polish-css';

export type FormFactor = 'tv' | 'handheld';
export type Orientation = 'portrait' | 'landscape';
export type SizeClass = 'compact' | 'medium' | 'expanded';

export interface WindowDp {
    width: number;
    height: number;
}

export const LAYOUT = { tv: 1920, compact: 600, shortLandscape: 1280, largeMin: 840, max: 1920 } as const;
const COMPACT_WIDTH_DP = 600;
const COMPACT_HEIGHT_DP = 480;

interface NativeShell {
    isTelevision?(): boolean;
    windowSizeDp?(): string;
}

export function detectFormFactor(shell: NativeShell | undefined, coarsePointer: boolean): FormFactor {
    if (shell?.isTelevision) return shell.isTelevision() ? 'tv' : 'handheld';
    // Outside the native shell (tests, desktop preview): touch screens are handhelds.
    return coarsePointer ? 'handheld' : 'tv';
}

export function layoutWidth(formFactor: FormFactor, window: WindowDp): number {
    if (formFactor === 'tv') return LAYOUT.tv;
    if (window.width < COMPACT_WIDTH_DP) return LAYOUT.compact;
    if (window.height < COMPACT_HEIGHT_DP) return LAYOUT.shortLandscape;
    return Math.min(LAYOUT.max, Math.max(LAYOUT.largeMin, Math.round(window.width)));
}

/** Size class of the chosen layout, used to scope the shell's CSS. */
export function sizeClass(layout: number): SizeClass {
    if (layout <= LAYOUT.compact) return 'compact';
    if (layout <= 900) return 'medium';
    return 'expanded';
}

export function parseWindowDp(raw: string | undefined, fallback: WindowDp): WindowDp {
    const [width, height] = (raw ?? '').split(',').map(Number);
    return width > 0 && height > 0 ? { width, height } : fallback;
}

function shell(): NativeShell | undefined {
    return (window as unknown as { IptvnatorAndroid?: NativeShell }).IptvnatorAndroid;
}

function currentWindow(): WindowDp {
    return parseWindowDp(shell()?.windowSizeDp?.(), { width: screen.width, height: screen.height });
}

function applyViewport(formFactor: FormFactor): void {
    const win = currentWindow();
    const layout = layoutWidth(formFactor, win);
    const meta = document.querySelector('meta[name="viewport"]');
    const content = `width=${layout}`;
    if (meta && meta.getAttribute('content') !== content) meta.setAttribute('content', content);
    const root = document.documentElement;
    const orientation: Orientation = win.height >= win.width ? 'portrait' : 'landscape';
    const size = sizeClass(layout);
    root.classList.toggle('portrait', orientation === 'portrait');
    root.classList.toggle('landscape', orientation === 'landscape');
    for (const name of ['compact', 'medium', 'expanded'] as const) root.classList.toggle(`size-${name}`, name === size);
}

export function installFormFactor(): FormFactor {
    const formFactor = detectFormFactor(shell(), window.matchMedia('(pointer: coarse)').matches);
    const root = document.documentElement;
    root.classList.add('android-shell', formFactor === 'tv' ? 'form-tv' : 'form-handheld');
    const style = document.createElement('style');
    style.id = 'android-shell-style';
    style.textContent = ANDROID_CSS + POLISH_CSS;
    document.head.appendChild(style);
    applyViewport(formFactor);
    // Rotation, fold/unfold and multi-window all surface as a resize.
    let pending = 0;
    window.addEventListener('resize', () => {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => applyViewport(formFactor));
    });
    return formFactor;
}
