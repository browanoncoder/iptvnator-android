# IPTVnator for Android TV (experimental)

A Capacitor shell that packages the [IPTVnator](https://github.com/4gray/iptvnator)
TV client (`apps/tv`, built for LG webOS) as an Android TV APK.

## Status

Verified on an Android TV emulator (API 34) against a Stalker portal:

- Catalog, movies, series and live TV load
- VOD episodes and live HLS channels play at 1080p in the system WebView
- Remote Back navigates inside the app; Back at the top level backgrounds it

Known limitation: portal requests still go through an IPTVnator web backend
(`apps/web-backend`), the same as on webOS.

## What the shell adds

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

## Run the backend

From the iptvnator checkout (the emulator reaches the host at `10.0.2.2`):

```sh
CLIENT_URL=http://localhost PORT=3333 IPTVNATOR_PROXY_ALLOW_PRIVATE_NETWORKS=1 \
  TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx apps/web-backend/src/main.ts
```

Then set the backend to `http://10.0.2.2:3333` (emulator) or `http://<mac-ip>:3333`
(real device) in the app's Settings.

## License

MIT, same as IPTVnator. Not affiliated with the IPTVnator maintainers.
