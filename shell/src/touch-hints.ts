/**
 * The TV client's hints speak remote ("OK: preview · OK again: fullscreen").
 * On phones and tablets they are rewritten for fingers.
 */
const TOUCH_HINTS: Readonly<Record<string, string>> = {
    'OK: preview · OK again: fullscreen': 'Tap: preview · tap again: fullscreen',
    'OK: switch channel · Back: close': 'Tap: switch channel · Back: close',
};

/** The touch wording for a remote hint, or undefined when it needs none. */
export function touchHint(text: string): string | undefined {
    return TOUCH_HINTS[text.trim()];
}

function rewrite(root: ParentNode): void {
    root.querySelectorAll('.muted').forEach((el) => {
        const hint = touchHint(el.textContent ?? '');
        if (hint !== undefined) el.textContent = hint;
    });
}

export function installTouchHints(): void {
    if (!document.documentElement.classList.contains('form-handheld')) return;
    const observer = new MutationObserver(() => rewrite(document.body));
    const start = () => {
        rewrite(document.body);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
}
