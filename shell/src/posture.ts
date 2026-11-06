/**
 * Tabletop posture on foldables: when the device is half-folded with a
 * horizontal hinge, fullscreen video sits on the upright half and the player
 * controls stay on the flat half, always visible and within thumb reach.
 */
export const TABLETOP = 'tabletop';

/** Fold position as a 0–1 fraction of the window height; 0 means not tabletop. */
export function tabletopFold(detail: unknown): number {
    const fold = Number((detail as { fold?: unknown } | null)?.fold);
    return fold > 0.2 && fold < 0.8 ? fold : 0;
}

export function installPosture(): void {
    window.addEventListener('iptvnator-posture', (event) => {
        const fold = tabletopFold((event as CustomEvent).detail);
        const root = document.documentElement;
        root.classList.toggle(TABLETOP, fold > 0);
        if (fold > 0) root.style.setProperty('--fold', `${(fold * 100).toFixed(2)}vh`);
        else root.style.removeProperty('--fold');
    });
}
