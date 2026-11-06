#!/bin/sh
# Turns the E2E screenshots (docs/screenshots/<form>/*.png, full device resolution)
# into the lighter JPEGs the README embeds. macOS (sips).
set -eu
for png in docs/screenshots/*/*.png; do
    jpg="${png%.png}.jpg"
    sips -s format jpeg -s formatOptions 78 -Z 1280 "$png" --out "$jpg" >/dev/null
    rm "$png"
done
du -sh docs/screenshots
