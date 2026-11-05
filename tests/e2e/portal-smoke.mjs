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

await device.launch({ clearData: true });

await step('01 add portal', async () => {
    await device.nav('Sources');
    await device.click('button', '^STALKER$');
    await device.waitFor(`!!document.querySelector('input[name="macAddress"]')`);
    await device.eval(`(() => {
        const set = (name, value) => { const i = document.querySelector('input[name="' + name + '"]'); i.value = value; i.dispatchEvent(new Event('input', { bubbles: true })); };
        set('name', 'Portal'); set('url', ${JSON.stringify(PORTAL_URL)}); set('macAddress', ${JSON.stringify(PORTAL_MAC)});
    })()`);
    await device.click('button', '^Save and connect$');
    await device.waitFor(`[...document.querySelectorAll('button')].some((b) => /^Portal/.test(b.textContent.trim()))`, 45000);
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
        if (posters > 0) return `${n} categories; ${tried.join(', ')}`;
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

await step('09 series episode plays', async () => {
    await leavePlayer();
    await device.nav('Series');
    await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 45000);
    await sleep(1500);
    await device.eval(`document.querySelector('main .poster-card').click()`);
    const episodes = await device.waitFor(`[...document.querySelectorAll('main button')].filter((b) => /Episode|E\\d+|^\\d{2}/.test(b.textContent.trim())).length`, 45000);
    shot('09b-series-detail');
    await device.click('main button', 'Episode|E\\d+|^\\d{2}', 30000);
    await device.waitFor(PLAYING, 45000);
    return { episodes, video: await device.eval(VIDEO) };
});

await step('10 search', async () => {
    await leavePlayer();
    await device.nav('Search');
    await device.waitFor(`!!document.querySelector('main input')`, 10000);
    await device.eval(`(() => { const i = document.querySelector('main input'); i.value = 'the'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const n = await device.waitFor(`document.querySelectorAll('main .poster-card').length`, 30000);
    await sleep(2000);
    return `${n} results for "the"`;
});

device.close();
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
    console.log(`${r.ok ? '✔' : '✖'} ${r.name.padEnd(width)} ${String(r.ms).padStart(6)} ms  ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail ?? '')}${r.video ? '  video=' + JSON.stringify(r.video) : ''}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
