# IPTVnator for Android TV (experimental)

A Capacitor shell that packages the [IPTVnator](https://github.com/4gray/iptvnator)
TV client (`apps/tv`, built for LG webOS) as an Android TV APK.

## Status

Verified on an Android TV emulator (API 34) against a Stalker portal:

- Catalog, movies, series and live TV load
- VOD episodes and live HLS channels play at 1080p in the system WebView
- Remote Back navigates inside the app; Back at the top level backgrounds it

- **Standalone**: no server needed. Backend routes are answered on-device and
  portal requests go out through Android's native HTTP stack

## What the shell adds

- On-device backend (`shell/src/embedded-backend.ts`): the six routes the TV
  client uses (`/tv/connection`, `/tv/connection/check`, `/provider-targets`,
  `/stalker`, `/xtream`, `/parse`), reusing IPTVnator's shared Stalker header/URL
  builders so portals see the same requests as from the desktop app
- Leanback launcher entry, TV banner, touchscreen not required
- Fixed 1920x1080 CSS viewport, matching the layout the TV client targets
- Android Back key mapped to the client's own Back handling (`BrowserBack`)
- `webOS.platformBack()` shim that sends the app to the background on Home

## Build

Requirements: Node 24, pnpm 10, JDK 21 (Android Studio's JBR works), Android SDK 35.

```sh
# 1. Build the TV client inside a sibling iptvnator checkout
cd ../iptvnator && pnpm install --frozen-lockfile && pnpm nx build tv && cd -

# 2. Install shell dependencies, copy the build in and assemble the APK
pnpm install
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npm run build:apk
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

## Optional remote backend

Fresh installs use the on-device backend (`http://iptvnator.device`). Entering
another backend URL in Settings switches the app to that server instead.

## License

MIT, same as IPTVnator. Not affiliated with the IPTVnator maintainers.
