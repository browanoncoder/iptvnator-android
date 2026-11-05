/**
 * Shell stylesheet, scoped by the classes the shell sets on <html>:
 *   android-shell · form-tv | form-handheld · portrait | landscape
 *   size-compact | size-medium | size-expanded · tabletop
 *   drawer-open · player-active · zapping
 *
 * The same components are used on TV and phone; only sizes change.
 */
export const ANDROID_CSS = `
/* Standalone app: the on-device backend replaces the home server, phone
   pairing needs a server, and phones have no remote to configure. */
.android-shell .backend-connection,
.android-shell .phone-setup,
.form-handheld #settings-tab-remote { display: none !important; }

/* ── Unified navigation rail ─────────────────────────────────────────── */
.android-shell { --rail: 112px; --rail-open: 330px; --rail-pad: 25px; --nav-font: 21px; }
.form-handheld { --rail: 76px; --rail-open: 280px; --rail-pad: 7px; --nav-font: 17px; }
.android-shell aside {
    width: var(--rail); padding: 92px 0 24px; overflow: hidden; z-index: 30;
    transition: width .2s cubic-bezier(.2,0,0,1), box-shadow .2s ease;
}
.android-shell main { margin-left: var(--rail); }
.android-shell .wordmark {
    position: absolute; top: 22px; left: var(--rail); height: 52px; line-height: 52px;
    margin: 0; padding: 0; font-size: 26px; white-space: nowrap; opacity: 0; transition: opacity .15s;
}
.android-shell .wordmark small { display: none; }
.android-shell nav button {
    display: flex; align-items: center; gap: 18px; white-space: nowrap; overflow: hidden;
    width: calc(100% - 2 * var(--rail-pad)); margin: 0 var(--rail-pad) 8px; padding: 12px;
    font-size: var(--nav-font); text-align: left;
}
.android-shell .nav-icon { flex: 0 0 38px; width: 38px; text-align: center; }
.android-shell .side-caption { white-space: nowrap; opacity: 0; transition: opacity .15s; padding-left: var(--rail-pad); }
.drawer-open aside { width: var(--rail-open); box-shadow: 30px 0 80px rgba(0,0,0,.6); }
.drawer-open .wordmark, .drawer-open .side-caption { opacity: 1; }
#android-menu {
    position: fixed; top: 22px; left: 0; z-index: 31; width: var(--rail); height: 52px; min-height: 0;
    display: flex; align-items: center; justify-content: center; padding: 0;
    background: transparent; color: var(--tv-muted, #b8c7bf); border: 0; box-shadow: none;
}
#android-scrim {
    position: fixed; inset: 0; z-index: 29; background: rgba(0,0,0,.55);
    opacity: 0; pointer-events: none; transition: opacity .2s ease;
}
.drawer-open #android-scrim { opacity: 1; pointer-events: auto; }
.form-tv #android-scrim { pointer-events: none !important; }
.android-shell:has(aside[hidden]) #android-menu,
.player-active #android-menu, .player-active #android-scrim { display: none; }

/* ── Player chrome ───────────────────────────────────────────────────── */
.android-shell .player-top > span { display: none; }
.android-shell .player-top { padding-right: 120px; }
.android-shell .native-player.fullscreen { touch-action: none; }
#android-more {
    position: fixed; top: 46px; right: 46px; z-index: 25; display: none;
    width: 64px; height: 64px; min-height: 0; padding: 0; border-radius: 50%;
    font-size: 30px; line-height: 1; background: rgba(13,20,17,.7);
}
.form-handheld #android-more { top: 20px; right: 20px; width: 56px; height: 56px; }
.player-active:has(.player-controls:not(.dormant):not([hidden])) #android-more { display: block; }
.zapping .live-overlay, .zapping .player-controls { opacity: 0 !important; }
/* Stable controls while seeking: the time readout and Play/Pause keep their
   width, so nothing beside them jitters on every second or skip. */
/* 17ch fits "1:05:12 / 1:55:47"; the Speed button fits "1.25× speed". */
.android-shell .player-bottom .actions > span { display: inline-block; min-width: 17ch; margin: 0 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.android-shell .player-bottom #android-speed { min-width: 8em; text-align: center; font-variant-numeric: tabular-nums; }
.android-shell .player-bottom [data-focus="player-toggle"] { min-width: 168px; text-align: center; }
.form-handheld .player-bottom [data-focus="player-toggle"] { min-width: 124px; }
.android-shell video { background: #000; }
/* "Restoring saved position…" floats below the bar instead of pushing the
   controls up, and the picture stays black until it is at the saved spot
   (no flash of the opening seconds). */
.android-shell .player-bottom > [role="status"] { position: absolute; top: 100%; left: 0; margin: 10px 0 0; }
body:has(.player-bottom > [role="status"]) video { opacity: 0; }
/* Back hides the controls at once; same look as the client's idle state. */
.controls-hidden .player-controls { opacity: 0; pointer-events: none; }
.controls-hidden #android-more { display: none !important; }
/* Keep the picture fullscreen while the client briefly drops to preview. */
.zapping .native-player { left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 20; }

/* ── Tabletop posture: picture above the hinge, controls below ───────── */
.tabletop .native-player.fullscreen video { height: var(--fold) !important; }
.tabletop .player-controls {
    top: var(--fold); background: rgba(11,16,15,.98); padding: 16px 24px;
}
.tabletop .player-controls.dormant { opacity: 1; pointer-events: auto; }
.tabletop .player-bottom { position: static; margin-top: 12px; }
.tabletop .player-bottom h1 { font-size: 26px; }
.tabletop #android-more { top: calc(var(--fold) + 16px); }

/* ── Quick menu (same sheet on TV and phone) ─────────────────────────── */
#android-quick-menu { position: fixed; inset: 0; z-index: 60; }
#android-quick-menu .qm-scrim { position: absolute; inset: 0; background: rgba(0,0,0,.45); }
#android-quick-menu .qm-sheet {
    position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(960px, 100%); box-sizing: border-box; padding: 28px 32px 36px;
    background: rgba(13,20,17,.97); border-radius: 28px 28px 0 0;
    box-shadow: 0 -20px 60px rgba(0,0,0,.5); animation: qm-up .2s cubic-bezier(.2,0,0,1);
}
#android-quick-menu .qm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
#android-quick-menu .qm-title { flex: 0 0 140px; color: var(--tv-muted, #9fb2a8); font-size: 18px; letter-spacing: 2px; text-transform: uppercase; }
#android-quick-menu button { min-width: 96px; }
#android-quick-menu button[aria-pressed='true'] { background: var(--tv-accent, #7fe0c4); color: #04120b; }
.form-handheld #android-quick-menu .qm-sheet { padding: 20px 16px calc(24px + env(safe-area-inset-bottom)); }
.form-handheld #android-quick-menu .qm-title { flex-basis: 100%; font-size: 13px; }
.form-handheld #android-quick-menu button { min-width: 72px; min-height: 48px; }
@keyframes qm-up { from { transform: translate(-50%, 40%); opacity: 0; } }

/* ── Pickers slide in from the right (categories, seasons, sort, source) ─ */
.android-shell .tv-dialog-backdrop {
    justify-content: flex-end; align-items: stretch; padding: 0;
    background: rgba(0,0,0,.55); animation: sheet-fade .2s ease;
}
.android-shell .tv-dialog {
    width: min(680px, 92vw); max-height: none; height: 100%; box-sizing: border-box;
    padding: 40px 36px; border-radius: 28px 0 0 28px; box-shadow: -30px 0 80px rgba(0,0,0,.5);
    animation: sheet-in .22s cubic-bezier(.2,0,0,1);
}
.form-handheld .tv-dialog { width: min(440px, 88vw); padding: 24px 18px; }
.form-handheld .tv-dialog-header h2 { font-size: 26px; }
.form-handheld .tv-picker-options button { min-height: 56px; font-size: 20px; padding: 12px 16px; margin-bottom: 8px; }
.android-shell .tv-dialog-backdrop.closing { animation: sheet-fade .18s ease reverse forwards; pointer-events: none; }
.android-shell .tv-dialog-backdrop.closing .tv-dialog { animation: sheet-out .18s cubic-bezier(.3,0,1,1) forwards; }
@keyframes sheet-in { from { transform: translateX(100%); } }
@keyframes sheet-out { to { transform: translateX(100%); } }
@keyframes sheet-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
    .android-shell *, .android-shell *::before { animation: none !important; transition: none !important; }
}

/* ── One control style: every dropdown and text field looks and lines up the same ── */
.android-shell { --ctl-h: 64px; --ctl-font: 24px; --ctl-radius: 8px; --ctl-pad: 0 22px; }
.form-handheld { --ctl-h: 52px; --ctl-font: 18px; --ctl-pad: 0 16px; }
.android-shell .tv-select,
.android-shell main input:not([type='checkbox']):not([type='range']):not([type='radio']),
.android-shell main select {
    box-sizing: border-box; height: var(--ctl-h); min-height: var(--ctl-h); padding: var(--ctl-pad);
    font-size: var(--ctl-font); line-height: 1.2; color: var(--tv-text);
    background: var(--tv-surface); border: 1px solid var(--tv-line); border-radius: var(--ctl-radius);
}
.android-shell main input::placeholder { color: var(--tv-muted); }
.android-shell header .tv-select { background: var(--tv-surface); }
/* Field labels sit the same distance above every control, so a row of filters aligns. */
.android-shell .catalog-filters { align-items: flex-end; gap: 24px; }
.android-shell .catalog-filters label { display: flex; flex-direction: column; gap: 10px; margin: 0; flex: 1 1 0; width: auto; min-width: 0; }
/* "All sources" on Home is a caption, not a control: don't dress it as a dropdown. */
.android-shell .home-scope { background: none; padding: 0; border-radius: 0; font-size: var(--ctl-font); line-height: var(--ctl-h); }

/* ── Handheld: touch targets and compact content ─────────────────────── */
.form-handheld button { min-height: 48px; }
.form-handheld .page-header { flex-wrap: wrap; gap: 12px; }
.form-handheld header .tv-select { max-width: 100%; }
.form-handheld main { padding: 20px 20px 32px; }
.form-handheld .episode { min-height: 0; padding: 18px 20px; }
/* The episode virtualizer measures these heights, so rows stay in sync. */
.form-handheld .virtual-collection .episode:not(.with-still) { height: 132px; padding: 16px 18px; }
.form-handheld .rich-episodes .episode-grid { grid-auto-rows: 330px; }
.form-handheld .rich-episodes .virtual-collection .episode.with-still { height: 330px; }
.form-handheld .with-still .episode-still { height: 150px; }
.form-handheld .with-still .episode-copy { padding: 14px; }
.form-handheld .episode-number { font-size: 28px; }
.form-handheld .episode strong { margin: 6px 0; }

/* ── Compact width (phone portrait, fold cover screen): TV guide sized for a phone ──────────────────────── */
.form-handheld.size-compact .grid-guide { padding: 16px 12px; }
.form-handheld.size-compact .grid-guide-header h1 { font-size: 24px; }
.form-handheld.size-compact .grid-guide-header > button { margin-left: 8px; font-size: 15px; padding: 8px 12px; }
.form-handheld.size-compact .grid-toolbar { flex-wrap: wrap; gap: 8px; }
.form-handheld.size-compact .grid-toolbar button { margin: 0; padding: 8px 12px; font-size: 15px; }
.form-handheld.size-compact .grid-date { order: -1; flex-basis: 100%; font-size: 16px; padding: 0 0 4px; }
.form-handheld.size-compact .grid-axis { font-size: 13px; padding-right: 0; }
.form-handheld.size-compact .grid-axis > span { width: 68px; padding-left: 4px; font-size: 0; }
.form-handheld.size-compact .grid-axis time { padding-left: 4px; white-space: nowrap; }
.form-handheld.size-compact .grid-channel { width: 60px; margin-right: 8px; padding: 6px; justify-content: center; }
.form-handheld.size-compact .grid-channel .channel-logo { margin: 0; width: 44px; height: 44px; }
.form-handheld.size-compact .grid-channel > span:last-child { display: none; }
.form-handheld.size-compact .grid-program { padding: 6px 8px; }
.form-handheld.size-compact .grid-program time { font-size: 12px; }
.form-handheld.size-compact .grid-program strong { font-size: 14px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.form-handheld.size-compact .grid-details { flex-direction: column; align-items: stretch; gap: 10px; }
.form-handheld.size-compact .grid-details-actions { flex-direction: row; flex-wrap: wrap; gap: 8px; }

/* ── Compact width (phone portrait, fold cover screen): one column, nothing truncated ───────────────────── */
.form-handheld.size-compact .page-header { flex-direction: column; align-items: stretch; }
.form-handheld.size-compact .page-header h1 { font-size: 30px; }
.form-handheld.size-compact .live-layout { grid-template-columns: minmax(0, 1fr); }
.form-handheld.size-compact .hero { min-height: 280px; padding: 24px; }
.form-handheld.size-compact .hero h1 { font-size: 34px; }
.form-handheld.size-compact .catalog-filters { flex-direction: column; align-items: stretch; }
.form-handheld.size-compact .catalog-filters { gap: 12px; }
.form-handheld.size-compact .catalog-filters label { width: 100%; flex: none; margin: 0; }
.form-handheld.size-compact .player-bottom h1 { font-size: 30px; }
.form-handheld.size-compact .settings-workspace { flex-direction: column; }
.form-handheld.size-compact .settings-categories {
    display: flex; width: auto; gap: 8px; margin: 0 0 16px; padding: 4px;
    overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; flex-shrink: 0;
}
.form-handheld.size-compact .settings-categories button {
    flex: 0 0 auto; width: auto; min-height: 48px; margin: 0; padding: 10px 18px;
    white-space: nowrap; scroll-snap-align: start; border-radius: 24px;
}
.form-handheld.size-compact .settings-categories small { display: none; }
.form-handheld.size-compact .settings-workspace > [role='tabpanel'] { padding: 20px; }
`;
