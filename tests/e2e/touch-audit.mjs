// Experience audit for touch screens (phone, foldable, tablet): the same
// measurements as ux-audit.mjs, but every step is a finger — taps, double-taps,
// press-and-hold, swipes and the on-screen keyboard — against the sample portal.
// Saves a screenshot per step (OUT/shots) for a visual review.
//
//   node tests/sample-portal/server.mjs &
//   SERIAL=emulator-5554 CDP_PORT=9392 OUT=build/touch node tests/e2e/touch-audit.mjs
import { adb, Device } from './device.mjs';
import { addPortal, BUDGET, createAudit, createShooter, INSTRUMENT, PLAYING, SAMPLE_MAC, SAMPLE_PORTAL, sleep } from './ux-lib.mjs';

const { SERIAL = 'emulator-5554', PORTAL_URL = SAMPLE_PORTAL, PORTAL_MAC = SAMPLE_MAC, OUT } = process.env;
const device = new Device(SERIAL, Number(process.env.CDP_PORT ?? 9392));
const { scenario, report } = createAudit(device, `Experience audit — touch (${SERIAL})`);
const MIN_TARGET_PX = 40; // ~ the 48 dp touch-target guideline, minus a little padding tolerance

const shot = createShooter(device, OUT);

const fullscreen = () => device.eval(`!!document.querySelector('.native-player.fullscreen')`);
const viewport = () => device.eval(`({ w: innerWidth, h: innerHeight })`);
const posters = `document.querySelectorAll('main .poster-card').length`;
const drawerOpen = () => device.eval(`document.documentElement.classList.contains('drawer-open')`);
const usesDrawer = () => device.eval(`(() => { const m = document.getElementById('android-menu'); return !!m && m.getBoundingClientRect().width > 0 && getComputedStyle(m).display !== 'none'; })()`);
const video = () => device.eval(`(() => { const v = document.querySelector('video'); return v && { t: v.currentTime, d: v.duration, paused: v.paused, rate: v.playbackRate }; })()`);
const controlsUp = () => device.eval(`!!document.querySelector('.player-controls:not(.dormant)') && !document.documentElement.classList.contains('controls-hidden')`);
/** Tap the picture only if the controls are hidden (a tap while they are up hides them). */
async function showControls() {
    if (await controlsUp()) return;
    const { w: pw, h: ph } = await viewport();
    await device.tap(pw / 2, ph * 0.4);
    await sleep(500);
}
const back = async (wait = 700) => { device.key('KEYCODE_BACK'); await sleep(wait); };

/** Layout sanity on the current screen: no sideways scroll, touch targets big enough. */
async function layoutChecks(check) {
    const r = await device.eval(`(() => {
        const overflow = document.scrollingElement.scrollWidth - innerWidth;
        const small = [...document.querySelectorAll('button, a[href], input, [role="button"], [role="combobox"]')].filter((e) => {
            const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
            return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && s.visibility !== 'hidden' && s.opacity !== '0' && Math.min(b.width, b.height) < ${MIN_TARGET_PX};
        }).map((e) => (e.id || e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 18) + ' ' + Math.round(e.getBoundingClientRect().width) + '×' + Math.round(e.getBoundingClientRect().height));
        return { overflow, small: [...new Set(small)] };
    })()`);
    check('no sideways scrolling', r.overflow <= 1, r.overflow > 1 ? `${r.overflow}px` : '');
    check(`touch targets ≥ ${MIN_TARGET_PX}px`, r.small.length === 0, r.small.slice(0, 6).join(', '));
}

async function goTo(label) {
    if (await usesDrawer()) {
        if (!(await drawerOpen())) await device.tapOn('#android-menu');
        await device.waitFor(`document.documentElement.classList.contains('drawer-open')`, 3000);
        await sleep(250);
    }
    await device.tapOn('aside nav button, nav button', `^${label}$`);
}

/** Opens the filter called `label` (Category, Sort by, Content) and taps the option. */
async function pick(label, option, filterText) {
    // Close the keyboard first, as a person would before reaching for a filter.
    if (await device.eval(`document.documentElement.classList.contains('keyboard-open')`)) {
        await device.eval(`document.activeElement?.blur()`);
        await device.waitFor(`!document.documentElement.classList.contains('keyboard-open')`, 3000).catch(() => undefined);
        await sleep(300);
    }
    // Phones fold the filters behind one button; open it like a finger would.
    const folded = await device.eval(`(() => { const t = document.querySelector('.filters-toggle'); return !!t && t.offsetWidth > 0 && t.getAttribute('aria-expanded') !== 'true'; })()`);
    if (folded) {
        await device.tapOn('.filters-toggle');
        await sleep(300);
    }
    const pos = await device.eval(`(() => { const l = [...document.querySelectorAll('main label')].find((l) => l.textContent.trim().startsWith(${JSON.stringify(label)})); const b = l && l.querySelector('button.tv-select'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!pos) throw new Error(`no "${label}" filter`);
    await device.tap(pos.x, pos.y);
    await device.waitFor(`document.querySelectorAll('.tv-dialog [role="listbox"] button').length > 0`, 15000);
    await sleep(400); // let the sheet finish sliding in, as a finger would
    let filtered;
    if (filterText) {
        await device.tapOn('.tv-picker-search input');
        await device.type(filterText);
        await sleep(400);
        filtered = await device.eval(`[...document.querySelectorAll('.tv-dialog [role="listbox"] button')].map((b) => b.textContent.trim())`);
    }
    const pattern = typeof option === 'string' ? option : option.source;
    await device.eval(`[...document.querySelectorAll('.tv-dialog [role="listbox"] button')].find((b) => new RegExp(${JSON.stringify(pattern)}).test(b.textContent.trim()))?.scrollIntoView({ block: 'center' })`);
    await sleep(200);
    const t = Date.now();
    await device.tapOn('.tv-dialog [role="listbox"] button', pattern);
    await device.waitFor(`!document.querySelector('.tv-dialog-backdrop:not(.closing)')`, 5000);
    return { t, filtered };
}

// ------------------------------------------------------------------ run

await device.launch({ clearData: true });
await device.eval(INSTRUMENT);
const { w, h } = await viewport();

await scenario('setup: add the portal', async (check) => {
    check('source connects', (await addPortal(device, PORTAL_URL, PORTAL_MAC)) >= 0);
});

await scenario('navigate: menu and destinations', async (check) => {
    for (const [label, ready] of [['Home', `document.querySelectorAll('main .poster-card, main .channel').length > 0`], ['Movies', `${posters} > 0`], ['TV', `document.querySelectorAll('main button').length > 3`], ['Search', `!!document.querySelector('main input')`]]) {
        const t = Date.now();
        await goTo(label);
        await device.waitFor(ready, 30000);
        const ms = Date.now() - t;
        check(`${label} within ${BUDGET.contentMs} ms`, ms <= BUDGET.contentMs, `${ms} ms`);
        const closed = await device.waitFor(`!document.documentElement.classList.contains('drawer-open')`, 1000).then(() => true, () => false);
        check(`${label}: the menu closes after choosing`, closed);
        await shot(`nav-${label.toLowerCase()}`);
        if (label === 'Home') await layoutChecks(check);
    }
    if (await usesDrawer()) {
        await device.tapOn('#android-menu');
        await device.waitFor(`document.documentElement.classList.contains('drawer-open')`, 3000);
        await shot('menu-open');
        await layoutChecks(check);
        await device.tapOn('#android-scrim');
        await sleep(500);
        check('tapping outside closes the menu', !(await drawerOpen()));
        await device.tapOn('#android-menu');
        await sleep(400);
        await device.swipe(Math.min(200, w * 0.4), h / 2, 10, h / 2, 200);
        await sleep(500);
        check('swiping left closes the menu', !(await drawerOpen()));
        await device.tapOn('#android-menu');
        await sleep(400);
        await back();
        check('Back closes the menu and stays in the app', !(await drawerOpen()) && (await device.eval('1')) === 1);
    }
});

await scenario('movies: filter, sort, search, scroll', async (check) => {
    await goTo('Movies');
    await device.waitFor(`${posters} > 0`, 30000);
    await layoutChecks(check);
    const { t, filtered } = await pick('Category', 'TAMIL \\| MOVIES \\| LATEST', 'tamil');
    await device.waitFor(`[...document.querySelectorAll('main .poster-card')].slice(0, 3).every((c) => /tamil/i.test(c.textContent))`, 30000);
    check(`category filter within ${BUDGET.contentMs} ms`, Date.now() - t <= BUDGET.contentMs, `${Date.now() - t} ms`);
    check('typing in the category list narrows it', filtered.length > 0 && filtered.length < 30 && filtered.every((o) => /tamil/i.test(o)), `${filtered.length} options`);
    await shot('movies-tamil');
    const sortT = (await pick('Sort by', '^Title')).t;
    await device.waitFor(`(() => { const n = [...document.querySelectorAll('main .poster-card')].slice(0, 6).map((c) => c.textContent.trim().toLowerCase()); return n.length > 1 && n.every((x, i) => !i || n[i - 1].localeCompare(x, undefined, { numeric: false }) <= 0); })()`, 15000).then(() => true, () => false)
        .then((sorted) => check('Sort by Title orders A–Z', sorted, `${Date.now() - sortT} ms`));
    await device.tapOn('main input[type="search"]');
    await device.type('tamil 1');
    const st = Date.now();
    await device.waitFor(`(() => { const c = [...document.querySelectorAll('main .poster-card')]; return c.length > 0 && c.every((x) => /tamil 1/i.test(x.textContent)); })()`, 15000);
    check(`search this source within ${BUDGET.contentMs} ms`, Date.now() - st <= BUDGET.contentMs, `${Date.now() - st} ms`);
    await shot('movies-search');
    await device.eval(`(() => { const i = document.querySelector('main input[type="search"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); })()`);
    await pick('Category', '^All categories$');
    await device.waitFor(`${posters} > 10`, 30000);
    const before = await device.eval(`({ n: ${posters}, y: (document.querySelector('main') || document.scrollingElement).scrollTop })`);
    for (let i = 0; i < 4; i++) await device.swipe(w / 2, h * 0.8, w / 2, h * 0.25, 220);
    // Let the fling settle (a tap during a fling only stops it, as on any Android list).
    await device.waitFor(`new Promise((done) => { const m = document.querySelector('main'); const y = m.scrollTop; setTimeout(() => done(Math.abs(m.scrollTop - y) < 1), 300); })`, 6000).catch(() => undefined);
    const after = await device.eval(`({ n: ${posters}, y: (document.querySelector('main') || document.scrollingElement).scrollTop })`);
    check('swiping scrolls the catalog', after.y > before.y + 100, `${Math.round(before.y)} → ${Math.round(after.y)} px`);
    await shot('movies-scrolled');
});

await scenario('movie: detail → play', async (check) => {
    await device.tapOn('main .poster-card');
    const t = Date.now();
    await device.waitFor(`[...document.querySelectorAll('main button')].some((b) => /^(Play|Watch|Resume)/.test(b.textContent.trim()))`, 15000);
    check(`detail within ${BUDGET.contentMs} ms`, Date.now() - t <= BUDGET.contentMs, `${Date.now() - t} ms`);
    await shot('detail');
    await layoutChecks(check);
    const p = Date.now();
    await device.tapOn('main button', '^(Play|Watch|Resume)');
    await device.waitFor(PLAYING, 20000);
    check(`picture within ${BUDGET.pictureMs} ms`, Date.now() - p <= BUDGET.pictureMs, `${Date.now() - p} ms`);
    check('opens fullscreen', await fullscreen());
});

await scenario('player: touch gestures', async (check) => {
    const { w: pw, h: ph } = await viewport();
    // The player opens with its controls up; wait for them to fade first.
    await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 8000).catch(() => undefined);
    await device.tap(pw / 2, ph * 0.4);
    await sleep(500);
    check('tap shows the controls', await controlsUp());
    await device.tap(pw / 2, ph * 0.4);
    await sleep(700);
    check('tap again hides them', !(await controlsUp()));
    await showControls();
    await shot('player-controls');
    await layoutChecks(check);
    let before = await video();
    await device.tap(pw * 0.85, ph * 0.4); await sleep(120); await device.tap(pw * 0.85, ph * 0.4);
    await sleep(800);
    let v = await video();
    check('double-tap right skips +10 s', Math.abs(v.t - before.t - 10) < 3, `${(v.t - before.t).toFixed(1)} s`);
    await sleep(400);
    before = await video();
    await device.tap(pw * 0.15, ph * 0.4); await sleep(120); await device.tap(pw * 0.15, ph * 0.4);
    await sleep(800);
    v = await video();
    check('double-tap left skips −10 s', Math.abs(v.t - before.t + 10) < 3, `${(v.t - before.t).toFixed(1)} s`);
    await sleep(400);
    await device.eval('window.__uxQuietTap = true');
    await device.touch('touchStart', pw / 2, ph * 0.35);
    await sleep(1000);
    const held = (await video()).rate;
    await device.touch('touchEnd', pw / 2, ph * 0.35);
    await sleep(500);
    await device.eval('window.__uxQuietTap = false');
    check('press and hold plays 2×, release returns to 1×', held === 2 && (await video()).rate === 1, `${held}× → ${(await video()).rate}×`);
    // From the picture, not the button row (a swipe that starts on a button is ignored).
    await device.swipe(pw / 2, ph * 0.5, pw / 2, ph * 0.12, 200);
    await device.waitFor(`!!document.getElementById('android-quick-menu')`, 3000).then(() => true, () => false)
        .then((open) => check('swipe up opens the quick menu', open));
    await shot('quick-menu');
    await layoutChecks(check);
    before = await video();
    await device.tapOn('#android-quick-menu button', '\\+5 min'); await sleep(500);
    await device.tapOn('#android-quick-menu button', '\\+5 min'); await sleep(800);
    v = await video();
    check('+5 min twice: +10 min, menu stays open', Math.abs(v.t - before.t - 600) < 20 && (await device.eval(`!!document.getElementById('android-quick-menu')`)), `${Math.round(v.t - before.t)} s`);
    await device.tapOn('#android-quick-menu button', '^50%$'); await sleep(900);
    v = await video();
    check('Go to 50%', Math.abs(v.t - v.d / 2) < 15, `${Math.round(v.t)} / ${Math.round(v.d)} s`);
    await back(800);
    check('Back closes the menu, not the player', !(await device.eval(`!!document.getElementById('android-quick-menu')`)) && (await fullscreen()));
    await showControls();
    const bar = await device.eval(`(() => { const r = document.querySelector('.seek input[type=range]').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
    await device.tap(bar.x + bar.w * 0.25, bar.y);
    await sleep(1200);
    v = await video();
    check('tap on the progress bar at 25% jumps there', Math.abs(v.t / v.d - 0.25) < 0.04, `${Math.round((v.t / v.d) * 100)}%`);
    check(`progress bar is easy to hit (≥ ${MIN_TARGET_PX}px tall)`, bar.h >= MIN_TARGET_PX, `${Math.round(bar.h)}px`);
    const from = Math.round(bar.x + bar.w * 0.3);
    await device.swipe(from, bar.y, Math.round(bar.x + bar.w * 0.6), bar.y, 400);
    await sleep(1200);
    v = await video();
    check('dragging the progress bar to 60% seeks there', Math.abs(v.t / v.d - 0.6) < 0.05, `${Math.round((v.t / v.d) * 100)}%`);
    await showControls();
    await device.tapOn('.player-bottom .actions button', 'Pause'); await sleep(600);
    check('Pause button pauses', (await video()).paused);
    await showControls();
    await device.tapOn('.player-bottom .actions button', 'Play|Resume'); await sleep(800);
    check('Play button resumes', !(await video()).paused);
    await device.tapOn('#android-speed'); await sleep(500);
    check('Speed button: 1.25×', (await video()).rate === 1.25);
    for (let i = 0; i < 4; i++) { await device.tapOn('#android-speed'); await sleep(350); }
    check('Speed button cycles back to 1×', (await video()).rate === 1);
    for (let i = 0; i < 3 && (await fullscreen()); i++) await back(900);
    check('system Back leaves the player (within 2 presses)', !(await fullscreen()));
});

await scenario('live: play, fullscreen, change channel', async (check) => {
    await goTo('TV');
    await device.tapOn('main button', '→$', 30000).catch(() => undefined);
    await device.waitFor(`[...document.querySelectorAll('main button')].some((b) => /Sample Channel/.test(b.textContent))`, 20000);
    const t = Date.now();
    await device.tapOn('main button', 'Sample Channel 1');
    await device.waitFor(PLAYING, 20000);
    check(`channel picture within ${BUDGET.pictureMs} ms`, Date.now() - t <= BUDGET.pictureMs, `${Date.now() - t} ms`);
    await shot('live-preview');
    await layoutChecks(check);
    if (!(await fullscreen())) await device.tapOn('button', 'Fullscreen');
    await sleep(800);
    check('Fullscreen opens the player', await fullscreen());
    const { w: pw, h: ph } = await viewport();
    await showControls();
    const title = `document.querySelector('.player-bottom h1')?.textContent`;
    const first = await device.eval(title);
    await device.tapOn('[data-focus="player-channels"], button', '^Channels');
    await device.waitFor(`!!document.querySelector('.live-overlay')`, 5000);
    await shot('live-channels');
    await layoutChecks(check);
    const z = Date.now();
    await device.tapOn('.live-overlay button', 'Sample Channel 3');
    await device.waitFor(`${title} !== ${JSON.stringify(first)}`, 8000).catch(() => undefined);
    await device.waitFor(PLAYING, 15000);
    check(`tap another channel: picture within ${BUDGET.pictureMs} ms`, Date.now() - z <= BUDGET.pictureMs && (await device.eval(title)) !== first, `${Date.now() - z} ms`);
    for (let i = 0; i < 4 && ((await fullscreen()) || (await device.eval(`!!document.querySelector('.live-overlay')`))); i++) await back(900);
    check('Back returns to the channel list', !(await fullscreen()));
});

await scenario('search: type and filter', async (check) => {
    await goTo('Search');
    await device.tapOn('main input');
    await device.type('sample film');
    const t = Date.now();
    await device.waitFor(`${posters} > 0`, 15000);
    check(`results within ${BUDGET.contentMs} ms`, Date.now() - t <= BUDGET.contentMs, `${Date.now() - t} ms`);
    check('keyboard does not hide the results', await device.eval(`(() => { const c = document.querySelector('main .poster-card'); const r = c && c.getBoundingClientRect(); const visible = innerHeight * (document.documentElement.classList.contains('keyboard-open') ? 0.55 : 1); return !!r && r.top + 40 < visible && r.bottom > 0; })()`));
    await shot('search-results');
    await layoutChecks(check);
    await device.eval(`document.activeElement?.blur()`);
    await pick('Content', '^Live TV$');
    await sleep(1500);
    check('switching content type keeps the page usable', await device.eval(`!document.querySelector('main [role="alert"]')`));
    const names = await device.eval(`[...document.querySelectorAll('main .station-grid button, main .station-card')].map((b) => b.textContent.trim().toLowerCase())`);
    check('the search still applies to Live TV', names.every((n) => n.includes('sample film')), `${names.length} channels listed for "sample film"`);
    await shot('search-live');
});

const portrait = await device.eval(`document.documentElement.classList.contains('portrait')`);
if (portrait) {
    await scenario('rotate to landscape and back', async (check) => {
        const rotate = (q) => { adb(SERIAL, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'); adb(SERIAL, 'shell', 'settings', 'put', 'system', 'user_rotation', String(q)); };
        await goTo('Movies');
        rotate(1);
        await device.waitFor(`innerWidth > innerHeight`, 8000);
        await sleep(1200);
        await shot('landscape-movies');
        await layoutChecks(check);
        check('posters still showing', await device.eval(`${posters} > 0`));
        rotate(0);
        await device.waitFor(`innerWidth < innerHeight`, 8000);
        await sleep(800);
    });
}

await scenario('back on Home', async (check) => {
    await goTo('Home');
    await sleep(800);
    await back(300);
    check('Back on Home asks before leaving', /again to exit/.test(await device.eval(`document.getElementById('iptv-osd')?.textContent ?? ''`)));
});

await report(OUT);
device.close();
