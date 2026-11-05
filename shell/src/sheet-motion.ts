/**
 * Slide-out for the client's pickers. The client unmounts a dialog at once;
 * a short-lived, inert copy plays the exit so every side panel slides in and
 * slides back out, on TV and phone alike.
 */
const EXIT_MS = 180;
const SHEET = 'tv-dialog-backdrop';

export function installSheetMotion(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    new MutationObserver((records) => {
        for (const record of records) {
            record.removedNodes.forEach((node) => {
                // Skip our own exit copies, or each removal would spawn another.
                if (!(node instanceof HTMLElement) || !node.classList.contains(SHEET) || node.classList.contains('closing')) return;
                const ghost = node.cloneNode(true) as HTMLElement;
                ghost.classList.add('closing');
                ghost.setAttribute('aria-hidden', 'true');
                ghost.setAttribute('inert', '');
                ghost.querySelectorAll('[data-tv-modal]').forEach((e) => e.removeAttribute('data-tv-modal'));
                document.body.appendChild(ghost);
                setTimeout(() => ghost.remove(), EXIT_MS);
            });
        }
    }).observe(document.body, { childList: true });
}
