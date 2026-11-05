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
  and start over for movies and episodes; channels, TV guide and programme for live TV.
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
  otherwise consumes them).
- Phone-sized TV guide, compact episode cards, full-width filters and scrollable
  settings categories in portrait.
- Test suites: 33 unit tests (on-device backend routes, gestures, zapping, quick-menu
  focus, form factor, posture) and E2E suites for TV, phone and foldable.
- Release pipeline: version from `package.json`, release signing, CI and tagged
  GitHub releases.
- **Speed button** in the player's control row (TV and touch): OK or tap steps through
  1× → 3× → 1×. Before, remote speed control was only reachable while the controls were hidden.
- One control style: every dropdown and text field shares height, font, corners and fill,
  so labels and boxes line up (e.g. Search's field next to its pickers).
- `tests/e2e/portal-smoke.mjs`: report-style smoke run against a real Stalker portal.

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

## [0.1.0] - 2026-11-04

- Android TV / phone shell for the IPTVnator TV client, standalone with no server:
  backend routes answered on-device, provider requests over native HTTP.
- Remote Back, media keys, keep-screen-on, hold-to-scan, 10 s skip, speed control.
