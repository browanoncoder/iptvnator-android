/**
 * Visual polish from the independent screenshot review (TV, phone, foldable,
 * tablet). Kept apart from android-css.ts, which holds the layout system.
 */
export const POLISH_CSS = `
/* ── Touch screens: no TV-style highlights nobody asked for ─────────────── */
/* Android's default tap highlight is a translucent blue box that lingered on
   tapped cards and dropdowns, reading as a second "selected" colour. */
.form-handheld, .form-handheld * { -webkit-tap-highlight-color: transparent; }
/* Focus rings are for the remote and keyboards; a tap (or focus the app moves
   for you) shows none, so the mint ring no longer sits on untouched items. */
.form-handheld :focus:not(:focus-visible) { outline: none; }

/* ── Rail: no half-clipped labels while it is collapsed ─────────────────── */
/* The collapsed rail cut each label to its first letter ("H", "T", "M"). The
   label is a bare text node, so the text goes transparent and the icon keeps
   its own colour; labels fade in as the rail opens. */
.android-shell:not(.drawer-open) aside nav button { color: transparent; }
.android-shell:not(.drawer-open) aside nav button .nav-icon { color: var(--tv-muted, #b8c7bf); }
.android-shell:not(.drawer-open) aside nav button[aria-current='page'] .nav-icon { color: var(--tv-accent, #7fe0c4); }
.android-shell aside nav button { transition: color .15s ease; }
/* Phone landscape is short: tighter rail items so Settings stays on screen,
   and the rail scrolls if a screen is shorter still. */
.form-handheld.landscape aside { padding-top: 80px; overflow-y: auto; }
.form-handheld.landscape aside nav button { min-height: 44px; padding: 6px 12px; margin-bottom: 2px; }

/* ── Player: readable over any picture ──────────────────────────────────── */
/* A stronger scrim behind the title and controls; the title, time and labels
   no longer melt into bright frames. */
.android-shell .player-controls {
  background:
    linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.62) 34%, rgba(0,0,0,0) 62%),
    linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 22%);
}
.android-shell .player-bottom h1 { text-shadow: 0 2px 12px rgba(0,0,0,.7); }
.android-shell .player-bottom .actions > span { color: #fff; text-shadow: 0 1px 3px #000; }
/* The "Playback position" caption sat on the video; the bar speaks for itself
   (the input keeps its accessible name from the label). */
.android-shell .player-bottom .seek { font-size: 0; }
/* Tablet / foldable: the time readout takes its own line above the buttons,
   so the buttons fit one row instead of orphaning "♡ Save". */
.form-handheld:not(.size-compact) .player-bottom .actions > span { order: -1; flex-basis: 100%; margin: 0 0 6px; }

/* ── Quick menu: solid, uncluttered ─────────────────────────────────────── */
#android-quick-menu .qm-scrim { background: rgba(0,0,0,.62); }
#android-quick-menu .qm-sheet { background: #0f1513; }
.form-handheld #android-quick-menu .qm-title { margin-top: 8px; }
/* The speed / seek toast covered the sheet's buttons; the sheet shows state. */
body:has(#android-quick-menu) #iptv-osd { opacity: 0 !important; }

/* ── Catalog on handhelds ───────────────────────────────────────────────── */
/* Poster titles wrapped off the card's edge on phones; captions were one line,
   cutting off exactly the part that tells titles apart. Fixed heights keep the
   virtual list's row measurement exact. */
.form-handheld .poster-fallback { left: 12px; right: 12px; bottom: 40px; font-size: clamp(15px, 3.6vw, 24px); line-height: 1.15; overflow-wrap: anywhere; }
.form-handheld .poster-card > strong {
  white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  font-size: 16px; line-height: 1.25; height: 2.5em;
}
/* Tablet / foldable: four filters in a row truncated their values; 2 × 2. */
.form-handheld:not(.size-compact) .catalog-filters { flex-wrap: wrap; }
.form-handheld:not(.size-compact) .catalog-filters label { flex: 1 1 calc(50% - 12px); width: auto; }
/* Phone portrait: live channels in one column, so names are not all "Sample …". */
.form-handheld.size-compact .station-grid { grid-template-columns: minmax(0, 1fr); }

/* ── Phones: filters fold behind one button (filter-panel.ts) ───────────── */
.filters-toggle { display: none; }
.android-shell.filters-fold .catalog-filters { flex-direction: row; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.android-shell.filters-fold .catalog-filters > label:first-child { order: 0; flex: 1 1 55%; min-width: 0; width: auto; }
.android-shell.filters-fold .catalog-filters > label:not(:first-child) { order: 2; display: none; flex: 1 1 100%; width: 100%; }
.android-shell.filters-fold.filters-open .catalog-filters > label:not(:first-child) { display: flex; }
.android-shell.filters-fold .filters-toggle {
  order: 1; display: inline-flex; align-items: center; justify-content: center; flex: none;
  min-height: 56px; padding: 0 18px; margin: 0; border-radius: 12px; white-space: nowrap;
  background: var(--tv-surface, #18201d); color: inherit; font-size: 17px; border: 1px solid rgba(255,255,255,.08);
}
.android-shell.filters-fold .filters-toggle[aria-expanded='true'] { border-color: var(--tv-accent, #7fe0c4); }
.android-shell.filters-fold .filters-toggle::after { content: ' ▾'; margin-left: 6px; opacity: .7; }
.android-shell.filters-fold .filters-toggle[aria-expanded='true']::after { content: ' ▴'; }
/* Phone landscape: the search, filters button and open filters share rows. */
.android-shell.filters-fold.landscape .catalog-filters > label:not(:first-child) { flex: 1 1 calc(50% - 6px); }

/* The source picker sits beside the title as a compact chip on phones. */
.android-shell.filters-fold .page-header { flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 12px; }
.android-shell.filters-fold .page-heading { flex: 1 1 auto; min-width: 0; }
.android-shell.filters-fold .page-header .tv-select {
  flex: 0 1 auto; width: auto; max-width: 48%; min-height: 48px; padding: 8px 14px; font-size: 15px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Typing a search on any touch screen (keyboard up, see filter-panel.ts): it takes half the screen, so
   the source picker and other filters step aside and results stay in view. */
.form-handheld.keyboard-open:has(.catalog-filters input:focus) .page-header .tv-select,
.form-handheld.keyboard-open:has(.catalog-filters input:focus) .catalog-filters > label:not(:first-child),
.form-handheld.keyboard-open:has(.catalog-filters input:focus) .catalog-filters > .filters-toggle { display: none; }

/* ── Detail page on touch screens ───────────────────────────────────────── */
/* The client hides the poster below 1000 px and leaves half the screen empty;
   on phones the poster sits above the title, on tablets / foldables beside it.
   The source picker belongs to catalog pages, not to one title's page. */
.form-handheld .page-header:has([data-focus='detail-back'], [data-focus='person-back']) .tv-select { display: none; }
.form-handheld .page-header > button[data-focus$='-back'] { width: auto; align-self: flex-start; }
.form-handheld .detail-hero { min-height: 0; margin-top: 16px; }
.form-handheld .detail-poster { display: flex; width: 220px; min-width: 220px; height: 330px; margin-right: 32px; border-radius: 12px; overflow: hidden; }
.form-handheld.size-compact .detail-hero { flex-direction: column; align-items: flex-start; }
.form-handheld.size-compact .detail-poster { width: 200px; min-width: 200px; height: 300px; margin: 0 0 24px; }

/* ── TV guide ───────────────────────────────────────────────────────────── */
/* The panel was 98% opaque: the live page's heading and channel list showed
   through as ghosts. Wider channel column so names are not all "Sample Chann…". */
.android-shell .grid-overlay .live-overlay-panel { background: #0b100f; }
.form-tv .grid-channel { width: 330px; }
.form-tv .grid-axis > span { width: 342px; }
`;
