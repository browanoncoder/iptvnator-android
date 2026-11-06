// End-to-end suite for the Android shell, run against the Stalker mock portal.
//
//   FORM=tv    SERIAL=emulator-5556 node --test tests/e2e/app.e2e.mjs
//   FORM=phone SERIAL=emulator-5554 node --test tests/e2e/app.e2e.mjs
//   FORM=fold  SERIAL=emulator-5558 node --test tests/e2e/app.e2e.mjs   (Pixel Fold AVD)
//   FORM=tablet SERIAL=emulator-5560 node --test tests/e2e/app.e2e.mjs  (Pixel Tablet AVD)
//
// Requires the IPTVnator Stalker mock on the host (see README "Testing").
// Screenshots for the README are written to docs/screenshots/<form>/.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { adb, Device, sleep } from './device.mjs';

const FORM = process.env.FORM ?? 'tv';
const SERIAL = process.env.SERIAL ?? { tv: 'emulator-5556', phone: 'emulator-5554', fold: 'emulator-5558', tablet: 'emulator-5560' }[FORM];
const PORTAL = process.env.MOCK_PORTAL ?? 'http://10.0.2.2:3210/stalker_portal/server/load.php';
// "is-series" scenario: VOD rows carry is_series=1, like many real Ministra portals.
const MAC = process.env.MOCK_MAC ?? '00:1A:79:00:00:04';
const SHOTS = `docs/screenshots/${FORM}`;
const isTv = FORM === 'tv';
const isPhone = FORM === 'phone';
const isFold = FORM === 'fold';
const isTablet = FORM === 'tablet';
// Large screens (unfolded fold, tablet) lay out at their own width.
const isLarge = isFold || isTablet;
// Layout viewport per device: TV 1920, compact phone 600, unfolded fold and
// landscape tablet = their own width (841dp, 1280dp).
const EXPECTED_WIDTH = { tv: 1920, phone: 600, fold: 841, tablet: 1280 }[FORM];

// WebView rounds the viewport to whole device pixels (e.g. 841 → 840 at 2.625x).
const widthIs = (width) => `Math.abs(innerWidth - ${width}) <= 2`;

const device = new Device(SERIAL, { tv: 9333, phone: 9334, fold: 9335, tablet: 9336 }[FORM]);
const shot = (name) => device.screenshot(`${SHOTS}/${name}.png`);

async function playingVideo() {
    return device.waitFor(
        `(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 3 && v.videoWidth > 0; })()`,
        40000
    );
}

describe(`IPTVnator Android (${FORM}, ${SERIAL})`, () => {
    before(async () => {
        mkdirSync(SHOTS, { recursive: true });
        await device.launch({ clearData: true });
    });
    after(() => device.close());

    test('fresh install uses the on-device backend', async () => {
        const backend = await device.waitFor(`new Promise((resolve) => {
            const open = indexedDB.open('iptvnator-tv-user-data', 1);
            open.onsuccess = () => {
                const get = open.result.transaction('state').objectStore('state').get('user');
                get.onsuccess = () => resolve(get.result?.data?.backend);
            };
        })`);
        assert.equal(backend, 'http://iptvnator.device');
    });

    test(`layout uses the ${EXPECTED_WIDTH}px ${FORM} viewport`, async () => {
        const layout = await device.eval(`({ width: innerWidth,
            classes: document.documentElement.className,
            overflow: document.scrollingElement.scrollWidth - innerWidth })`);
        assert.ok(Math.abs(layout.width - EXPECTED_WIDTH) <= 2, `viewport ${layout.width}px, expected ${EXPECTED_WIDTH}px`);
        assert.match(layout.classes, isTv ? /form-tv/ : /form-handheld/);
        assert.match(layout.classes, isTv || isLarge ? /size-(medium|expanded)/ : /size-compact/);
        assert.ok(layout.overflow <= 1, `page scrolls horizontally by ${layout.overflow}px`);
    });

    test('Sources hides server-only setup panels', async () => {
        await device.nav('Sources');
        await device.waitFor(`document.querySelector('h1')?.textContent === 'Sources'`);
        const visible = await device.eval(`['.backend-connection', '.phone-setup']
            .map((s) => document.querySelector(s)).filter((e) => e && e.offsetWidth).length`);
        assert.equal(visible, 0);
    });

    test('adds a Stalker portal through the Sources form', async () => {
        await device.click('button', '^STALKER$');
        await device.waitFor(`!!document.querySelector('input[name="macAddress"]')`);
        await device.eval(`(() => {
            const set = (name, value) => {
                const input = document.querySelector('input[name="' + name + '"]');
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            set('name', 'Mock Portal');
            set('url', ${JSON.stringify(PORTAL)});
            set('macAddress', ${JSON.stringify(MAC)});
        })()`);
        shot('01-add-source');
        await device.click('button', '^Save and connect$');
        await device.waitFor(`[...document.querySelectorAll('button')].some((b) => /Mock Portal/.test(b.textContent))`, 30000);
    });

    test('home shows the catalog', async () => {
        await device.nav('Home');
        await device.waitFor(`document.querySelectorAll('main button').length > 8`, 30000);
        await sleep(2500); // let artwork load for the screenshot
        shot('02-home');
    });

    test(isTv ? 'rail slides open on focus and closes on leaving' : 'menu button slides the rail in and out', async () => {
        await device.waitFor(`!!document.getElementById('android-menu')`);
        if (isTv) {
            await device.eval(`document.querySelector('aside nav button').focus()`);
            await device.waitFor(`document.documentElement.classList.contains('drawer-open')`, 3000);
            await sleep(400);
            shot('09-rail-open');
            // Real-hardware regression: ← / ↑ at the rail's edge must never park
            // focus on the ☰ cue (which closed the rail and clipped the focus ring).
            for (const key of ['KEYCODE_DPAD_LEFT', 'KEYCODE_DPAD_UP', 'KEYCODE_DPAD_LEFT']) {
                device.key(key);
                await sleep(300);
            }
            const edge = await device.eval(
                `({ inRail: !!document.activeElement?.closest('aside'), open: document.documentElement.classList.contains('drawer-open'), id: document.activeElement?.id })`
            );
            assert.ok(edge.inRail && edge.open, `focus left the rail at its edge: ${JSON.stringify(edge)}`);
            await device.eval(`document.querySelector('main button').focus()`);
        } else {
            await device.eval(`document.getElementById('android-menu').click()`);
            await device.waitFor(`document.documentElement.classList.contains('drawer-open')`, 3000);
            await sleep(400);
            shot('09-rail-open');
            device.key('KEYCODE_BACK');
        }
        await device.waitFor(`!document.documentElement.classList.contains('drawer-open')`, 3000);
        const rail = await device.eval(`document.querySelector('aside').getBoundingClientRect().width`);
        await sleep(400);
        const collapsed = await device.eval(`document.querySelector('aside').getBoundingClientRect().width`);
        assert.ok(collapsed <= (isTv ? 112 : 76) + 1, `rail still ${collapsed}px wide (was ${rail})`);
    });

    test('movies catalog loads posters', async () => {
        await device.nav('Movies');
        const cards = await device.waitFor(
            `[...document.querySelectorAll('main button')].filter((b) => /FILM|SERIES/.test(b.textContent)).length`,
            30000
        );
        assert.ok(cards >= 5, `only ${cards} movie cards`);
        await sleep(2500);
        shot('03-movies');
    });

    test('category picker slides in and fully slides out', async () => {
        // Phones fold the filters behind one "Filters" button.
        await device.eval(`(() => { const t = document.querySelector('.filters-toggle'); if (t && t.offsetWidth && t.getAttribute('aria-expanded') !== 'true') t.click(); })()`);
        await device.click('.catalog-filters button.tv-select', '.', 10000);
        await device.waitFor(`!!document.querySelector('.tv-dialog [role="listbox"] button')`);
        await sleep(400);
        shot('10-category-panel');
        const panel = await device.eval(`(() => { const r = document.querySelector('.tv-dialog').getBoundingClientRect(); return { right: r.right, left: r.left, width: innerWidth }; })()`);
        assert.ok(Math.abs(panel.right - panel.width) <= 1, 'panel is not docked to the right edge');
        device.key('KEYCODE_BACK');
        await device.waitFor(`!document.querySelector('.tv-dialog-backdrop')`, 3000);
        await sleep(600);
        assert.equal(await device.eval(`document.querySelectorAll('.tv-dialog-backdrop').length`), 0, 'a closed panel was left on screen');
    });

    test('series detail lists episodes (is_series lazy seasons)', async () => {
        await device.click('main button', 'SERIES');
        const episodes = await device.waitFor(
            `[...document.querySelectorAll('button')].filter((b) => /Episode|E\\d+/.test(b.textContent)).length`,
            30000
        );
        assert.ok(episodes > 0);
        await sleep(1500);
        shot('04-series-detail');
    });

    test('an episode plays', async () => {
        await device.click('button', 'Episode|^\\d{2}', 30000);
        await playingVideo();
        await sleep(1500);
        shot('05-episode-playing');
        const video = await device.video();
        assert.equal(video.error, null);
        assert.ok(Number.isFinite(video.duration));
        // The Speed button joins the control row by itself, with no other interaction.
        await device.waitFor(`!!document.querySelector('.player-bottom .actions #android-speed')`, 3000);
        if (isPhone) {
            // Compact phones turn to landscape for fullscreen playback.
            assert.equal(await device.eval('innerWidth'), 1280);
        }
        if (isLarge) {
            // Large screens keep the user's orientation.
            assert.ok(await device.eval(widthIs(EXPECTED_WIDTH)));
        }
    });

    test('quick menu changes speed and closes with Back', async () => {
        if (isTv) {
            await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000);
            device.key('KEYCODE_DPAD_DOWN');
        } else {
            await device.eval(`document.getElementById('android-more').click()`);
        }
        await device.waitFor(`!!document.getElementById('android-quick-menu')`, 5000);
        await sleep(400);
        shot('11-quick-menu');
        await device.click('#android-quick-menu button', '^1\\.5×$');
        await sleep(300);
        assert.equal((await device.video()).rate, 1.5);
        assert.equal(await device.eval(`!!document.getElementById('android-quick-menu')`), false);
        // Back to 1× through the menu, so later tests start from normal speed.
        await device.eval(`document.getElementById('android-more').click()`);
        await device.click('#android-quick-menu button', '^1×$');
        assert.equal((await device.video()).rate, 1);
    });

    test('Speed button in the control row cycles 1× → 1.25× … 3× → 1×', async () => {
        await device.waitFor(`!!document.getElementById('android-speed')`, 3000);
        const row = await device.eval(`(() => { const b = document.getElementById('android-speed');
            return { inRow: !!b.closest('.player-bottom .actions'), after: b.previousElementSibling?.textContent.trim(), label: b.textContent }; })()`);
        assert.ok(row.inRow, 'speed button is not in the control row');
        assert.match(row.after, /\+10/);
        assert.equal(row.label, '1× speed');
        // Nothing in the row may shift as the label changes (1× → 1.25× …).
        const lefts = `[...document.querySelectorAll('.player-bottom .actions > *')].map((e) => Math.round(e.getBoundingClientRect().left)).join()`;
        const layout = new Set([await device.eval(lefts)]);
        const seen = [];
        for (let i = 0; i < 5; i++) {
            await device.eval(`document.getElementById('android-speed').click()`);
            await sleep(150);
            seen.push((await device.video()).rate);
            layout.add(await device.eval(lefts));
        }
        assert.deepEqual(seen, [1.25, 1.5, 2, 3, 1]);
        assert.equal(layout.size, 1, `control row moved: ${[...layout].join(' | ')}`);
        assert.equal(await device.eval(`document.getElementById('android-speed').textContent`), '1× speed');
    });

    if (isTv) {
        test('progress bar: D-pad down reaches it and → jumps 2% of the title', async () => {
            await device.eval(`document.dispatchEvent(new MouseEvent('mousemove'))`); // controls up
            await device.waitFor(`!document.querySelector('.player-controls.dormant')`, 3000);
            await device.eval(`document.getElementById('android-speed').focus()`);
            device.key('KEYCODE_DPAD_DOWN');
            await device.waitFor(`document.activeElement?.matches('.seek input[type=range]')`, 3000);
            const before = (await device.video()).t;
            const duration = (await device.video()).duration;
            device.key('KEYCODE_DPAD_RIGHT');
            device.key('KEYCODE_DPAD_RIGHT');
            await sleep(800);
            const after = (await device.video()).t;
            const step = Math.min(300, Math.max(10, duration * 0.02));
            assert.ok(after - before >= step * 2 - 3, `moved ${after - before}s, expected ≈${step * 2}s`);
            assert.match(await device.eval(`document.getElementById('iptv-osd')?.textContent ?? ''`), /%/);
        });
    }

    if (isFold) {
        test('tabletop: half-folded, the picture sits above the hinge and controls stay below', async () => {
            const rotate = (quarterTurns) => {
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'user_rotation', String(quarterTurns));
            };
            try {
                rotate(1); // hinge horizontal
                await sleep(2000);
                adb(SERIAL, 'emu', 'posture', '2'); // half-opened
                await device.waitFor(`document.documentElement.classList.contains('tabletop')`, 10000);
                await sleep(6500); // past the controls' idle timeout
                const layout = await device.eval(`(() => {
                    const video = document.querySelector('.native-player video').getBoundingClientRect();
                    const controls = document.querySelector('.player-controls');
                    return { videoBottom: video.bottom, height: innerHeight,
                        controlsTop: controls.getBoundingClientRect().top,
                        opacity: getComputedStyle(controls).opacity };
                })()`);
                shot('15-tabletop');
                assert.ok(layout.videoBottom <= layout.height * 0.55, 'video extends below the hinge');
                assert.ok(layout.controlsTop >= layout.height * 0.45, 'controls are above the hinge');
                assert.equal(layout.opacity, '1', 'controls faded in tabletop');
            } finally {
                adb(SERIAL, 'emu', 'posture', '3');
                rotate(0);
            }
            await device.waitFor(`!document.documentElement.classList.contains('tabletop')`, 10000);
        });
    }

    if (isTv) {
        test('remote: tap right skips 10 s, ↑ shows the controls, Back hides them, OK pauses', async () => {
            // The mock episode is short: start near the beginning so it cannot end mid-test.
            await device.eval(`document.querySelector('video').currentTime = 3`);
            await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000);
            const before = (await device.video()).t;
            device.key('KEYCODE_DPAD_RIGHT');
            await sleep(600);
            assert.ok((await device.video()).t >= before + 8, 'tap did not skip forward');
            // ↑ shows the controls; Back hides them at once and stays in the player.
            device.key('KEYCODE_DPAD_UP');
            await device.waitFor(`!document.querySelector('.player-controls.dormant')`, 3000);
            device.key('KEYCODE_BACK');
            await device.waitFor(`document.documentElement.classList.contains('controls-hidden')`, 3000);
            assert.equal(await device.eval(`!!document.querySelector('.native-player.fullscreen')`), true);
            device.key('KEYCODE_DPAD_CENTER');
            await sleep(500);
            assert.equal((await device.video()).paused, true);
            device.key('KEYCODE_DPAD_CENTER');
            await device.waitFor(`!document.querySelector('video').paused`, 5000);
        });

        test('remote: holding right scans forward and seeks on release', async () => {
            await device.eval(`document.querySelector('video').currentTime = 3`);
            await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 20000);
            const before = (await device.video()).t;
            await device.holdKey('ArrowRight', 3000);
            await sleep(1200);
            const after = (await device.video()).t;
            assert.ok(after - before > 60, `scan moved only ${Math.round(after - before)} s`);
        });

        test('remote: holding right scans even while the controls are showing', async () => {
            await device.eval(`document.querySelector('video').currentTime = 3`);
            device.key('KEYCODE_DPAD_UP'); // wake the controls
            await device.waitFor(`!document.querySelector('.player-controls.dormant')`, 5000);
            await device.eval(`document.querySelector('[data-focus="player-toggle"]').focus()`);
            const before = (await device.video()).t;
            await device.holdKey('ArrowRight', 3000);
            await sleep(1200);
            const after = (await device.video()).t;
            assert.ok(after - before > 60, `scan moved only ${Math.round(after - before)} s`);
        });

        test('remote: 5 jumps to the middle; quick-menu jumps can be repeated', async () => {
            // Earlier scans may have run the short mock episode to its end.
            await device.eval(`(() => { const v = document.querySelector('video'); v.currentTime = 3; return v.play(); })()`);
            await device.waitFor(`!document.querySelector('video').paused`, 5000);
            device.key('KEYCODE_5');
            await sleep(800);
            const { t, duration } = await device.video();
            assert.ok(Math.abs(t - duration / 2) < 8, `5 went to ${t} of ${duration}`);
            await device.eval(`document.querySelector('video').currentTime = 3`);
            // Back hides the controls; ↓ then opens the quick menu.
            if (!(await device.eval(`!!document.querySelector('.player-controls.dormant')`))) {
                device.key('KEYCODE_BACK');
                await device.waitFor(`document.documentElement.classList.contains('controls-hidden')`, 3000);
            }
            device.key('KEYCODE_DPAD_DOWN');
            await device.waitFor(`!!document.getElementById('android-quick-menu')`, 3000);
            const plus30 = `[...document.querySelectorAll('#android-quick-menu button')].find((b) => /\\+30 s/.test(b.textContent))`;
            await device.eval(`${plus30}.focus()`);
            device.key('KEYCODE_DPAD_CENTER');
            await sleep(400);
            device.key('KEYCODE_DPAD_CENTER');
            await sleep(600);
            assert.equal(await device.eval(`!!document.getElementById('android-quick-menu')`), true, 'menu closed after a jump');
            assert.ok((await device.video()).t >= 60, `two +30 s jumps reached only ${(await device.video()).t}`);
            device.key('KEYCODE_BACK');
            await device.waitFor(`!document.getElementById('android-quick-menu')`, 3000);
        });

        test('remote: Back leaves the player without closing the app', async () => {
            // A first Back may only hide visible controls.
            for (let i = 0; i < 2 && (await device.eval(`!!document.querySelector('.native-player.fullscreen')`)); i++) {
                device.key('KEYCODE_BACK');
                await sleep(1200);
            }
            const inApp = await device.eval(`!document.querySelector('.player-controls')`);
            assert.equal(inApp, true);
        });
    }

    test('live TV plays a channel', async () => {
        // Leave the fullscreen player (Back) before using the navigation rail.
        for (let i = 0; i < 3 && (await device.eval(`!!document.querySelector('.native-player.fullscreen')`)); i++) {
            device.key('KEYCODE_BACK');
            await sleep(1200);
        }
        if (!isTv) await device.waitFor(widthIs(EXPECTED_WIDTH), 10000);
        await device.nav('TV');
        await device.click('main button', '→$', 30000);
        // Channel rows are numbered ("01 …"); older clients labelled them "Live channel".
        await device.click('main button', 'Live channel|^\\d{2}\\D', 30000);
        await playingVideo();
        await sleep(2000);
        shot('07-live');
    });

    if (isTv) {
        test('live: ↓ and CH− zap channels without leaving fullscreen', async () => {
            await device.click('button', 'Fullscreen', 10000);
            await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000);
            const title = () => device.eval(`document.querySelector('.player-bottom h1')?.textContent`);
            const first = await title();
            device.key('KEYCODE_DPAD_DOWN');
            await device.waitFor(`document.querySelector('.player-bottom h1')?.textContent !== ${JSON.stringify(first)}`, 8000);
            await device.waitFor(`!!document.querySelector('.native-player.fullscreen')`, 5000);
            await sleep(300);
            shot('12-zap');
            await device.waitFor(`!document.documentElement.classList.contains('zapping')`, 5000);
            device.key('KEYCODE_CHANNEL_DOWN');
            await device.waitFor(`document.querySelector('.player-bottom h1')?.textContent === ${JSON.stringify(first)}`, 8000);
            assert.equal(await device.eval(`!!document.querySelector('.native-player.fullscreen')`), true);
            // With the controls showing, ↓ still zaps instead of moving focus to Pause / Back.
            await device.waitFor(`!document.documentElement.classList.contains('zapping')`, 5000);
            await device.eval(`document.dispatchEvent(new MouseEvent('mousemove'))`);
            await device.waitFor(`!document.querySelector('.player-controls.dormant')`, 3000);
            device.key('KEYCODE_DPAD_DOWN');
            await device.waitFor(`document.querySelector('.player-bottom h1')?.textContent !== ${JSON.stringify(first)}`, 8000);
            for (let i = 0; i < 2 && (await device.eval(`!!document.querySelector('.native-player.fullscreen')`)); i++) {
                device.key('KEYCODE_BACK');
                await sleep(1000);
            }
        });
    }

    if (isFold) {
        test('folding to the cover screen switches to the compact layout and back', async () => {
            try {
                adb(SERIAL, 'emu', 'fold');
                await device.waitFor('innerWidth === 600', 15000);
                await sleep(1500);
                shot('13-folded-cover');
                assert.match(await device.eval('document.documentElement.className'), /size-compact/);
            } finally {
                adb(SERIAL, 'emu', 'unfold');
            }
            await device.waitFor(widthIs(EXPECTED_WIDTH), 15000);
            await sleep(1000);
            shot('14-unfolded');
        });
    }

    if (isTablet) {
        test('tablet: portrait uses the 840px medium layout and landscape returns to 1280px', async () => {
            // Pixel Tablet's natural orientation is landscape; a quarter turn is portrait.
            const rotate = (quarterTurns) => {
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'user_rotation', String(quarterTurns));
            };
            try {
                rotate(1);
                await device.waitFor(widthIs(840), 10000);
                await sleep(1500);
                const portrait = await device.eval(`({ classes: document.documentElement.className,
                    overflow: document.scrollingElement.scrollWidth - innerWidth })`);
                shot('08-portrait');
                assert.match(portrait.classes, /portrait/);
                assert.match(portrait.classes, /size-medium/);
                assert.ok(portrait.overflow <= 1, `portrait scrolls horizontally by ${portrait.overflow}px`);
            } finally {
                rotate(0);
            }
            await device.waitFor(widthIs(EXPECTED_WIDTH), 10000);
            assert.match(await device.eval('document.documentElement.className'), /size-expanded/);
        });
    }

    if (isPhone) {
        test('rotating to landscape switches to the 1280px layout', async () => {
            const rotate = (quarterTurns) => {
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
                adb(SERIAL, 'shell', 'settings', 'put', 'system', 'user_rotation', String(quarterTurns));
            };
            try {
                rotate(1);
                await device.waitFor('innerWidth === 1280', 10000);
                await sleep(1500);
                shot('08-landscape');
            } finally {
                rotate(0);
            }
            await device.waitFor('innerWidth === 600', 10000);
        });
    }
});
