/**
 * On phones the catalog's filters (content, category, sort) took most of the
 * screen above the first poster. There they fold behind one "Filters" button
 * next to the search field; the button counts the filters that are on.
 * Which screens fold is decided in CSS (html.filters-fold, see polish-css.ts).
 */
const DEFAULTS = new Set(['All categories', 'Recently added', 'Movies']);
const OPEN = 'filters-open';

/** Filters whose value is not the default one. */
export function activeFilters(values: readonly string[]): number {
    return values.filter((value) => !DEFAULTS.has(value.trim())).length;
}

export function filtersLabel(active: number): string {
    return active > 0 ? `Filters · ${active}` : 'Filters';
}

/** The filter values last seen; a change means a filter was just picked. */
let lastValues = '';

function sync(): void {
    const filters = document.querySelector<HTMLElement>('.catalog-filters');
    if (!filters) return;
    let button = filters.querySelector<HTMLButtonElement>(':scope > .filters-toggle');
    if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'filters-toggle';
        button.addEventListener('click', () => {
            const open = !document.documentElement.classList.contains(OPEN);
            document.documentElement.classList.toggle(OPEN, open);
            sync();
        });
        // Appended last: the client never re-orders nodes it did not create.
        filters.appendChild(button);
    }
    const values = [...filters.querySelectorAll('label button.tv-select')].map((b) => b.textContent ?? '');
    // Picking a value closes the panel, like a filter sheet would.
    const joined = values.join('|');
    if (joined !== lastValues && lastValues !== '') document.documentElement.classList.remove(OPEN);
    lastValues = joined;
    const label = filtersLabel(activeFilters(values));
    if (button.textContent !== label) button.textContent = label;
    const expanded = String(document.documentElement.classList.contains(OPEN));
    if (button.getAttribute('aria-expanded') !== expanded) button.setAttribute('aria-expanded', expanded);
}

/** The on-screen keyboard is up when the visible height drops well below the window's full height. */
export function keyboardOpen(visibleHeight: number, fullHeight: number): boolean {
    return fullHeight > 0 && visibleHeight < fullHeight * 0.75;
}

/** html.keyboard-open while the on-screen keyboard covers the page. */
function trackKeyboard(): void {
    const root = document.documentElement;
    // MainActivity reports the keyboard: edge-to-edge apps are not resized for it.
    let native = false;
    window.addEventListener('iptvnator-keyboard', (event) => {
        native = true;
        const height = Number((event as CustomEvent<{ height?: number }>).detail?.height) || 0;
        root.classList.toggle('keyboard-open', height > 0);
    });
    // Without the native report (browser builds), fall back to a viewport that shrinks.
    let width = 0;
    let full = 0;
    const update = () => {
        if (native) return;
        const visible = window.visualViewport?.height ?? window.innerHeight;
        if (window.innerWidth !== width) {
            width = window.innerWidth;
            full = 0;
        }
        full = Math.max(full, window.innerHeight, visible);
        root.classList.toggle('keyboard-open', keyboardOpen(visible, full));
    };
    window.visualViewport?.addEventListener('resize', update);
}

export function installFilterPanel(): void {
    if (!document.documentElement.classList.contains('form-handheld')) return;
    trackKeyboard();
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            sync();
        });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    sync();
}
