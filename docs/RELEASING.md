# Releasing

## One-time setup

Release APKs are signed with one long-lived key. **Back it up: Android will not
install an update signed with a different key.**

1. Create the key (outside the repository):

    ```sh
    mkdir -p ~/.iptvnator-android && chmod 700 ~/.iptvnator-android
    keytool -genkeypair -keystore ~/.iptvnator-android/release.keystore \
        -alias iptvnator -keyalg RSA -keysize 4096 -validity 10000
    ```

2. Local release builds read `android/keystore.properties` (git-ignored):

    ```properties
    storeFile=/Users/you/.iptvnator-android/release.keystore
    storePassword=…
    keyAlias=iptvnator
    keyPassword=…
    ```

3. CI reads the same values from repository secrets:

    ```sh
    base64 -i ~/.iptvnator-android/release.keystore | gh secret set IPTVNATOR_KEYSTORE_BASE64
    gh secret set IPTVNATOR_KEYSTORE_PASSWORD
    gh secret set IPTVNATOR_KEY_ALIAS --body iptvnator
    gh secret set IPTVNATOR_KEY_PASSWORD
    ```

## Every release

1. **Test.** With the Stalker mock running (see README, Testing), run all three suites:

    ```sh
    pnpm test                    # typecheck + unit tests
    pnpm run build:apk           # install on each emulator, then:
    pnpm run test:e2e:tv
    pnpm run test:e2e:phone
    FORM=fold node --test tests/e2e/app.e2e.mjs
    ```

2. **Update `CHANGELOG.md`** with a `## [x.y.z] - date` section. The release notes are
   taken from it.

3. **Bump and tag.** This updates `package.json`, which sets `versionName` and `versionCode`:

    ```sh
    npm version minor            # or patch / major
    git push --follow-tags
    ```

4. The **Release** workflow checks that the tag matches `package.json`. It runs typecheck
   and unit tests, builds the pinned IPTVnator TV client and a signed release APK, then
   verifies the signature. Finally it publishes a GitHub release with
   `IPTVnator-Android-x.y.z.apk` and `SHA256SUMS`.

## Updating the IPTVnator client

`upstream.json` pins the IPTVnator commit whose TV client is packaged. To move forward:

1. Change `ref`.
2. Run `node scripts/build-client.mjs --checkout` and `pnpm run build:apk`.
3. Re-run all E2E suites. The shell drives the client's DOM (`data-focus` keys,
   `.player-controls`, `.tv-dialog`, `.live-overlay`), so check the screenshots too.
