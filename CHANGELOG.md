# Changelog

All notable changes to IPTVnator for Android. Versions follow [SemVer](https://semver.org);
the Android `versionCode` is derived from it (`major·10000 + minor·100 + patch`).

## [0.2.0] - 2026-11-04

One app for TV, phone, foldable and tablet, with the same navigation everywhere.

### Added

- **Slide-in navigation rail** on every device: icons when collapsed, labels when open.
  On TV it opens when focus moves into it and closes when you pick a destination. On
  touch screens the ☰ button opens it; tap outside, swipe left or press Back to close it.
- **Slide-in side panels** for every picker (movie and series categories, seasons,
  sort order, source). They slide in from the right and slide back out.
- **Player quick menu**, the same sheet on TV and phone: speed (1×–3×), jump ±30 s / ±5 min
  (the menu stays open so a jump can be repeated) and go to start / 25% / 50% / 75% for movies and episodes; channels, TV guide and programme for live TV.
  Open it with ↓, Menu or a long press on OK on the remote, or by swiping up or tapping ⋯ on touch.
- **Channel zapping** in fullscreen live TV with ↑ / ↓ and CH+ / CH− (PageUp / PageDown),
  without leaving fullscreen.
- **Touch gestures:** press and hold for 2× while held, double-tap the left or right third to skip 10 s,
  swipe up for the quick menu.
- **Adaptive layouts** driven by Android window size classes: compact phone (600),
  phone landscape (1280), and unfolded foldables and tablets at their own width (≥ 840).
  The layout follows rotation, fold/unfold and multi-window resizes live.
- **Foldables:** tabletop posture puts the picture above the hinge and keeps the
  controls on the flat half. The cover screen gets the compact layout.
- Compact phones turn to landscape for fullscreen playback and turn back afterwards;
  tablets and unfolded foldables keep the orientation the user chose.
- Remote **Menu**, **Guide** and **Info** keys are forwarded to the page (Android
  otherwise consumes them; some TVs, e.g. the NVIDIA SHIELD, keep Menu and Guide for the system).
- Phone-sized TV guide, compact episode cards, full-width filters and scrollable
  settings categories in portrait.
- Test suites: 45 unit tests (on-device backend routes, gestures, zapping, quick-menu
  focus, form factor, posture) and E2E suites for TV, phone and foldable.
- Release pipeline: version from `package.json`, release signing, CI and tagged
  GitHub releases.
- **Speed button** in the player's control row (TV and touch): OK or tap steps through
  1× → 3× → 1×. Before, remote speed control was only reachable while the controls were hidden.
- One control style: every dropdown and text field shares height, font, corners and fill,
  so labels and boxes line up (e.g. Search's field next to its pickers).
- **Getting anywhere in a movie from the remote:** number keys 0–9 jump to the start, 10% … 90%
  (5 is the middle); on the progress bar each ← / → moves 2% of the title with an OSD showing
  where it lands; holding ← / → scans even while the controls are showing.
- **Controls on demand:** ↑ (or Info) shows the player controls and Back hides them at once;
  a second Back leaves the player. ↑ no longer changes speed (the Speed button does).
- On live TV ↑ / ↓ change channel even while the controls are showing, instead of moving
  focus onto Pause or Back; ⏭ / ⏮ change channel too.
- Remote Mute (when the remote sends it to apps), Captions and Audio-track keys toggle the
  player's sound, subtitles and audio language.
- `tests/e2e/portal-smoke.mjs`: report-style smoke run against a real Stalker portal.
- `tests/sample-portal/server.mjs`: a local Stalker portal that reproduces real-provider
  behaviour (126 categories, category quirk, no Series module, long HLS movies, live HLS)
  so most portal testing needs no provider account.
- `tests/e2e/ux-audit.mjs`: an experience audit that plays every scenario against the sample
  portal and measures time to picture, key response, layout shifts, focus loss and false
  error banners against budgets.
- Back on Home asks "Press Back again to exit" instead of leaving the app at once.

### Fixed

- Remote gestures treated live channels served as finite files as video on demand,
  which blocked the live channel drawer.
- The open rail could cover the page you had just chosen on TV.
- TV: pressing ← or ↑ at the rail's edge could park focus on the ☰ icon, which closed the
  rail and clipped the focus ring at the screen edge (seen on a real SHIELD).
- The WebView's default grey ▶ poster was stretched across the player before the first frame
  and after a failed stream; the player is now plain black.
- Player controls shifted while seeking: Play/Pause and the time readout now keep a fixed width.
- Home's "All sources" caption looked like a dropdown that didn't open.
- **Movie categories were empty on some Stalker portals** (only "All" and a few loaded). The
  TV client sends a category as both `category` and `genre`, which those portals answer with
  an empty list; the app now asks the way IPTVnator's desktop app does (`genre=0` for movies,
  category only for series) and falls back to the other forms.
- Portals without a Series module made the Series page report a connection failure and keep
  retrying; it now shows an empty page (series stay reachable in Movies categories).
- Resuming a movie made the controls jump and flashed its opening seconds while "Restoring
  saved position…" was shown; the message now floats below the bar and the picture stays black
  until it is at the saved spot.
- On phones and foldables the player's button row re-wrapped about a second after a movie
  started (the Speed button arrived with the duration), pushing the progress bar up; it is now
  in place from the first frame.
- Pressing → on the progress bar after other skips could jump backwards (it started from a
  stale bar position); it now steps from where the video is.
- The Speed button changed width between 1× and 1.25×, shifting ♡ Save; the time readout fits
  hours (`1:05:12 / 1:55:47`).

## [0.1.0] - 2026-11-04

- Android TV / phone shell for the IPTVnator TV client, standalone with no server:
  backend routes answered on-device, provider requests over native HTTP.
- Remote Back, media keys, keep-screen-on, hold-to-scan, 10 s skip, speed control.
