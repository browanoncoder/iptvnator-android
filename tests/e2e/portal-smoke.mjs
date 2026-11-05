// Smoke run against a REAL Stalker portal on a real device.
//
//   PORTAL_URL=… PORTAL_MAC=… SERIAL=192.168.0.145:5555 SHOTS=/tmp/shots \
//       node tests/e2e/portal-smoke.mjs
//
// Credentials come only from the environment and are never printed. Screenshots
// show real provider content: keep SHOTS outside the repository.
// Unlike the E2E suite this keeps going after a failure and prints a report,
// because real catalogs vary (categories, empty lists, offline streams).
import { mkdirSync } from 'node:fs';
import { Device } from './device.mjs';

const { PORTAL_URL, PORTAL_MAC, SERIAL, SHOTS } = process.env;
if (!PORTAL_URL || !PORTAL_MAC || !SERIAL || !SHOTS) {
    console.error('Set PORTAL_URL, PORTAL_MAC, SERIAL and SHOTS.');
    process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

const device = new Device(SERIAL, Number(process.env.CDP_PORT ?? 9337));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const shot = (name) => device.screenshot(`${SHOTS}/${name}.png`);

const PLAYING = `(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 3 && v.videoWidth > 0; })()`;
const VIDEO = `(() => { const v = document.querySelector('video'); if (!v) return null;
    const src = v.currentSrc || v.querySelector('source')?.src || '';
    let kind = 'other'; try { const p = new URL(src).pathname; kind = /\\.m3u8$/i.test(p) ? 'hls' : /\\.ts$/i.test(p) ? 'mpegts' : (p.split('.').pop() || 'none'); } catch {}
    return { kind, t: Math.round(v.currentTime), duration: Math.round(v.duration), size: v.videoWidth + 'x' + v.videoHeight,
        paused: v.paused, ready: v.readyState, error: v.error && (v.error.code + ' ' + v.error.message),
        banner: document.querySelector('[role="alert"]')?.textContent.trim().slice(0, 120) || null }; })()`;

async function step(name, fn) {
    const started = Date.now();
    try {
        const detail = await fn();
        results.push({ name, ok: true, ms: Date.now() - started, detail });
    } catch (error) {
        results.push({ name, ok: false, ms: Date.now() - started, detail: String(error.message ?? error).slice(0, 200) });
        await device.eval(VIDEO).then((v) => v && (results.at(-1).video = v)).catch(() => {});
    }
    try {
        shot(name.replace(/\W+/g, '-').toLowerCase());
    } catch {
        /* screenshot is best effort */
    }
}

async function leavePlayer() {
    // Only while fullscreen: Back on a top-level page exits the app.
    for (let i = 0; i < 3 && (await device.eval(`!!document.querySelector('.native-player.fullscreen')`)); i++) {
        device.key('KEYCODE_BACK');
        await sleep(1200);
    }
}

// KEEP_DATA=1 keeps the device's sources, favourites and history (and reuses an
// existing portal instead of adding one).
const keepData = process.env.KEEP_DATA === '1';
await device.launch({ clearData: !keepData });

// Controls in one row/form share a height and a bottom edge.
const UNIFORM = (selector) => `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.offsetParent);
    const r = els.map((e) => e.getBoundingClientRect());
    return { n: els.length, heights: [...new Set(r.map((x) => Math.round(x.height)))], bottoms: [...new Set(r.map((x) => Math.round(x.bottom)))] };
})()`;
const assertUniform = async (selector, min = 2) => {
    const u = await device.eval(UNIFORM(selector));
    if (u.n < min || u.heights.length !== 1 || u.bottoms.length !== 1) throw new Error(`not uniform: ${JSON.stringify(u)}`);
    return `${u.n} controls ${u.heights[0]}px high, aligned`;
};

await step('01 add portal', async () => {
    if (keepData) {
        await device.nav('Sources');
        await sleep(1500);
        if (await device.eval(`[...document.querySelectorAll('main button')].some((b) => /Stalker|Portal/i.test(b.textContent))`)) return 'kept existing source';
    }
    await device.nav('Sources');
    await device.click('button', '^STALKER$');
    await device.waitFor(`!!document.querySelector('input[name="macAddress"]')`);
    await device.eval(`(() => {
        const set = (name, value) => { const i = document.querySelector('input[name="' + name + '"]'); i.value = value; i.dispatchEvent(new Event('input', { bubbles: true })); };
        set('name', 'Portal'); set('url', ${JSON.stringify(PORTAL_URL)}); set('macAddress', ${JSON.stringify(PORTAL_MAC)});
    })()`);
    await device.click('button', '^Save and connect$');
    await device.waitFor(`[...document.querySelectorAll('button')].some((b) => /Portal/.test(b.textContent))`, 45000);
});

await step('02 home', async () => {
    await device.nav('Home');
    const n = await device.waitFor(`document.querySelectorAll('main button').length > 4 && document.querySelectorAll('main button').length`, 45000);
    await sleep(3000);
    return `${n} controls`;
});

await step('03 live categories and channel plays', async () => {
    await device.nav('TV');
    await device.click('main button', '→$', 45000);
    const n = await device.waitFor(`document.querySelectorAll('main .channel, main button').length`, 30000);
    await device.click('main button', 'Live channel|^\\d', 30000);
    await device.waitFor(PLAYING, 45000);
    await sleep(2000);
    return { channels: n, video: await device.eval(VIDEO) };
});

await step('04 live fullscreen and zap', async () => {
    await device.click('button', 'Fullscreen', 10000);
    await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000);
    const title = `document.querySelector('.player-bottom h1')?.textContent`;
    const first = await device.eval(title);
    device.key('KEYCODE_DPAD_DOWN');
    await device.waitFor(`${title} !== ${JSON.stringify(first)}`, 10000);
    await device.waitFor(PLAYING, 30000);
    const fullscreen = await device.eval(`!!document.querySelector('.native-player.fullscreen')`);
    if (!fullscreen) throw new Error('zap left fullscreen');
    return await device.eval(VIDEO);
});

await step('05 tv guide', async () => {
    device.key('KEYCODE_GUIDE');
    await sleep(500);
    const ok = await device.eval(`!!document.querySelector('.grid-guide')`);
    if (!ok) {
        await leavePlayer();
        await device.click('button', 'TV Guide', 10000);
    }
    const rows = await device.waitFor(`document.querySelectorAll('.grid-channel').length`, 30000);
    await sleep(2500);
    return `${rows} guide rows, ${await device.eval(`document.querySelectorAll('.grid-program').length`)} programmes`;
});

await step('06 movies catalog', async () => {
    device.key('KEYCODE_BACK');
    await sleep(800);
    await leavePlayer();
    await device.nav('Movies');
    const n = await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 45000);
    await sleep(3000);
    return `${n} posters`;
});

await step('07 movie category picker', async () => {
    await device.click('.catalog-filters button.tv-select', '.', 10000);
    const n = await device.waitFor(`document.querySelectorAll('.tv-dialog [role="listbox"] button').length`, 10000);
    await sleep(500);
    shot('07b-category-panel');
    // Real catalogs have empty categories: try a few until one has titles.
    const tried = [];
    for (let i = 1; i < Math.min(n, 6); i++) {
        if (i > 1) {
            await device.click('.catalog-filters button.tv-select', '.', 10000);
            await device.waitFor(`document.querySelectorAll('.tv-dialog [role="listbox"] button').length`, 10000);
        }
        const label = await device.eval(`(() => { const b = document.querySelectorAll('.tv-dialog [role="listbox"] button')[${i}]; b.click(); return b.textContent.trim().slice(0, 30); })()`);
        await device.waitFor(`!document.querySelector('.tv-dialog-backdrop:not(.closing)')`, 5000);
        const posters = await device
            .waitFor(`document.querySelectorAll('main .poster-card').length || (/No titles/.test(document.querySelector('main').textContent) && -1)`, 45000)
            .catch(() => 0);
        tried.push(`${label}: ${posters < 0 ? 'empty' : posters}`);
        if (posters > 0) return `${n} categories; ${tried.join(', ')}; ${await assertUniform('.catalog-filters .tv-select')}`;
    }
    throw new Error(`no category with titles: ${tried.join(', ')}`);
});

await step('08 movie plays', async () => {
    await device.eval(`document.querySelector('main .poster-card').click()`);
    await device.click('main button', '^(Play|Watch|Resume|Continue)|Episode|^\\d{2}', 30000);
    await device.waitFor(PLAYING, 45000);
    await sleep(2000);
    const before = (await device.eval(VIDEO)).t;
    await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000);
    device.key('KEYCODE_DPAD_RIGHT');
    await sleep(2500);
    const after = await device.eval(VIDEO);
    return { ...after, skipped: after.t - before };
});

await step('08b speed button by remote', async () => {
    // Wake the controls, put focus on +10 sec and walk right onto Speed with the D-pad.
    device.key('KEYCODE_DPAD_UP');
    await sleep(800);
    await device.waitFor(`!!document.querySelector('.player-bottom .actions #android-speed')`, 5000);
    await device.eval(`[...document.querySelectorAll('.player-bottom .actions button')].find((b) => /\\+10/.test(b.textContent)).focus()`);
    device.key('KEYCODE_DPAD_RIGHT');
    await sleep(500);
    const focused = await device.eval(`document.activeElement?.id`);
    if (focused !== 'android-speed') throw new Error(`D-pad right from +10 focused ${focused}`);
    const rates = [];
    for (let i = 0; i < 5; i++) {
        device.key('KEYCODE_DPAD_CENTER');
        await sleep(900);
        rates.push(await device.eval(`document.querySelector('video').playbackRate`));
        if (i === 3) shot('08c-speed-3x');
    }
    if (rates.join() !== '1.25,1.5,2,3,1') throw new Error(`rates ${rates.join()}`);
    return `OK presses → ${rates.join('× ')}×`;
});

await step('08d control row stays still while seeking', async () => {
    const RECTS = `[...document.querySelectorAll('.player-bottom .actions > *')].map((e) => Math.round(e.getBoundingClientRect().left)).join()`;
    await device.eval(`[...document.querySelectorAll('.player-bottom .actions button')].find((b) => /\\+10/.test(b.textContent)).focus()`);
    const before = await device.eval(RECTS);
    const seen = new Set([before]);
    for (let i = 0; i < 4; i++) {
        device.key('KEYCODE_DPAD_CENTER');
        await sleep(700);
        seen.add(await device.eval(RECTS));
    }
    await device.eval(`document.querySelector('[data-focus="player-toggle"]').click()`);
    await sleep(700);
    seen.add(await device.eval(RECTS));
    await device.eval(`document.querySelector('[data-focus="player-toggle"]').click()`);
    await sleep(700);
    seen.add(await device.eval(RECTS));
    if (seen.size !== 1) throw new Error(`row moved: ${[...seen].join(' | ')}`);
    return 'no shift across 4 skips and pause/play';
});

await step('08e no default poster', async () => {
    const poster = await device.eval(`document.querySelector('video')?.getAttribute('poster') || ''`);
    return poster ? `page poster ${poster.slice(0, 40)}` : 'no page poster (native default replaced by black)';
});

await step('09 series episode plays', async () => {
    await leavePlayer();
    await device.nav('Series');
    const found = await device
        .waitFor(`document.querySelectorAll('main .poster-card').length || (/No titles/.test(document.querySelector('main').textContent) && -1)`, 45000)
        .catch(() => 0);
    let note = '';
    if (found <= 0) {
        // Portals without a Series module keep series in the VOD catalog.
        if (await device.eval(`!!document.querySelector('[role="alert"]')`)) throw new Error('Series page shows an error instead of an empty page');
        note = 'no Series module (empty page, no error); via Movies → ';
        await device.nav('Movies');
        await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 45000);
        await device.click('.catalog-filters button.tv-select', '.', 10000);
        await device.waitFor(`[...document.querySelectorAll('.tv-dialog [role="listbox"] button')].some((b) => /SERIES|TV SHOWS/.test(b.textContent))`, 30000);
        note += await device.eval(`(() => { const b = [...document.querySelectorAll('.tv-dialog [role="listbox"] button')].find((b) => /SERIES|TV SHOWS/.test(b.textContent)); b.click(); return b.textContent.trim(); })()`);
        await device.waitFor(`!document.querySelector('.tv-dialog-backdrop:not(.closing)')`, 5000);
        await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 45000);
    }
    await sleep(1500);
    await device.eval(`document.querySelector('main .poster-card').click()`);
    const episodes = await device.waitFor(`[...document.querySelectorAll('main button')].filter((b) => /Episode|E\\d+|^\\d{2}/.test(b.textContent.trim())).length`, 45000);
    shot('09b-series-detail');
    await device.click('main button', 'Episode|E\\d+|^\\d{2}', 30000);
    await device.waitFor(PLAYING, 45000);
    return { note, episodes, video: await device.eval(VIDEO) };
});

await step('10 search', async () => {
    await leavePlayer();
    await device.nav('Search');
    await device.waitFor(`!!document.querySelector('main input')`, 10000);
    await device.eval(`(() => { const i = document.querySelector('main input'); i.value = ${JSON.stringify(process.env.SEARCH_TERM ?? 'the')}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const n = await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 30000);
    await sleep(2000);
    return `${n} results for "${process.env.SEARCH_TERM ?? 'the'}"; ${await assertUniform('.catalog-filters input, .catalog-filters .tv-select', 2)}`;
});

device.close();
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
    console.log(`${r.ok ? '✔' : '✖'} ${r.name.padEnd(width)} ${String(r.ms).padStart(6)} ms  ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail ?? '')}${r.video ? '  video=' + JSON.stringify(r.video) : ''}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
