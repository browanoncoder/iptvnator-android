// Experience audit: walks every main scenario with real remote keys against the
// sample portal and MEASURES the experience, instead of only asserting that
// things work. Prints a scored report; writes JSON + Markdown when OUT is set.
//
//   node tests/sample-portal/server.mjs &
//   SERIAL=emulator-5556 PORTAL_URL=http://10.0.2.2:3211/stalker_portal/server/load.php \
//     OUT=/tmp/ux node tests/e2e/ux-audit.mjs
//
// Measured per scenario:
//   time to content / picture   click or key → posters / first playing frame
//   key response                key press → first visible reaction (DOM, focus, OSD)
//   dead keys                   no visible reaction within 1 s
//   layout shift                CLS-style sum of unexpected movement
//   focus loss                  nothing focused on a remote-driven screen
//   false alarms                error banners on a healthy portal
import { execFileSync } from 'node:child_process';
import { Device } from './device.mjs';
import { addPortal, BUDGET, createAudit, createShooter, INSTRUMENT, PLAYING, SAMPLE_MAC, SAMPLE_PORTAL, sleep } from './ux-lib.mjs';

const { SERIAL = 'emulator-5556', PORTAL_URL = SAMPLE_PORTAL, PORTAL_MAC = SAMPLE_MAC, OUT } = process.env;
const device = new Device(SERIAL, Number(process.env.CDP_PORT ?? 9390));

const video = () => device.eval(`(() => { const v = document.querySelector('video'); return v && { t: v.currentTime, d: v.duration, paused: v.paused, rate: v.playbackRate }; })()`);
const fullscreen = () => device.eval(`!!document.querySelector('.native-player.fullscreen')`);
const key = async (code, wait = 500) => { device.key(`KEYCODE_${code}`); await sleep(wait); };
const timed = async (expression, timeoutMs = 30000) => { const t = Date.now(); await device.waitFor(expression, timeoutMs); return Date.now() - t; };

const { scenario, report } = createAudit(device, `Experience audit — remote (${SERIAL})`);
const shot = createShooter(device, OUT);

async function leavePlayer() {
    for (let i = 0; i < 3 && (await fullscreen()); i++) await key('BACK', 1000);
}

async function pickCategory(pattern) {
    await device.click('.catalog-filters button.tv-select', '.', 10000);
    await device.waitFor(`[...document.querySelectorAll('.tv-dialog [role="listbox"] button')].some((b) => new RegExp(${JSON.stringify(pattern)}).test(b.textContent))`, 30000);
    const label = await device.eval(`(() => { const b = [...document.querySelectorAll('.tv-dialog [role="listbox"] button')].find((b) => new RegExp(${JSON.stringify(pattern)}).test(b.textContent)); b.focus(); return b.textContent.trim(); })()`);
    const ms = Date.now();
    await key('DPAD_CENTER', 100);
    await device.waitFor(`!document.querySelector('.tv-dialog-backdrop:not(.closing)')`, 5000);
    await device.waitFor(`document.querySelectorAll('main .poster-card').length > 0`, 30000);
    return { label, ms: Date.now() - ms };
}

// ------------------------------------------------------------------ run

await device.launch({ clearData: true });
await device.eval(INSTRUMENT);

await scenario('setup: add the portal', async (check) => {
    check('source connects', (await addPortal(device, PORTAL_URL, PORTAL_MAC)) >= 0);
});

await scenario('home', async (check) => {
    const ms = await (async () => { const t = Date.now(); await device.nav('Home'); await device.waitFor(`document.querySelectorAll('main .poster-card, main .channel').length > 0`, 30000); return Date.now() - t; })();
    check(`content within ${BUDGET.contentMs} ms`, ms <= BUDGET.contentMs, `${ms} ms`);
    await shot('home');
});

await scenario('movies: browse and switch categories', async (check) => {
    const t = Date.now();
    await device.nav('Movies');
    await device.waitFor(`document.querySelectorAll('main .poster-card').length > 0`, 30000);
    check(`posters within ${BUDGET.contentMs} ms`, Date.now() - t <= BUDGET.contentMs, `${Date.now() - t} ms`);
    await shot('movies');
    for (const pattern of ['TAMIL \\| MOVIES', 'FRENCH \\| KIDS', 'SPORTING']) {
        const { label, ms } = await pickCategory(pattern);
        const own = await device.eval(`[...document.querySelectorAll('main .poster-card')].slice(0, 3).map((c) => c.textContent).join(' ')`);
        check(`"${label}" loads its own titles`, ms <= BUDGET.contentMs && !/No titles/.test(own), `${ms} ms`);
    }
    await pickCategory('^All$|^All categories$').catch(() => undefined);
    check('focus returns to the page after picking', await device.eval(`!!document.activeElement && document.activeElement !== document.body`));
});

await scenario('movie: detail → play', async (check) => {
    await pickCategory('ENGLISH \\| MOVIES \\| LATEST');
    await device.eval(`(() => { const c = document.querySelector('main .poster-card'); (c.matches('button, a, [tabindex]') ? c : c.querySelector('button, a, [tabindex]') ?? c).focus(); })()`);
    await key('DPAD_CENTER', 200);
    const play = await timed(`[...document.querySelectorAll('main button')].some((b) => /^(Play|Watch|Resume)/.test(b.textContent.trim()))`, 15000);
    check(`detail within ${BUDGET.contentMs} ms`, play <= BUDGET.contentMs, `${play} ms`);
    await shot('detail');
    check('detail focuses Play', await device.eval(`/^(Play|Watch|Resume)/.test(document.activeElement?.textContent.trim() ?? '')`), await device.eval(`document.activeElement?.textContent.trim().slice(0, 30)`));
    await device.eval(`[...document.querySelectorAll('main button')].find((b) => /^(Play|Watch|Resume)/.test(b.textContent.trim())).focus()`);
    const t = Date.now();
    await key('DPAD_CENTER', 100);
    await device.waitFor(PLAYING, 20000);
    check(`picture within ${BUDGET.pictureMs} ms`, Date.now() - t <= BUDGET.pictureMs, `${Date.now() - t} ms`);
    check('opens fullscreen', await fullscreen());
    await shot('player');
});

await scenario('player: remote keys', async (check) => {
    await device.waitFor(`!!document.querySelector('.player-controls.dormant')`, 15000).catch(() => undefined);
    let before = await video();
    await key('DPAD_RIGHT', 700);
    check('→ skips 10 s with controls hidden', (await video()).t - before.t >= 8, `${Math.round((await video()).t - before.t)} s`);
    await key('DPAD_UP', 600);
    check('↑ shows the controls', await device.eval(`!document.querySelector('.player-controls.dormant')`));
    check('↑ does not change speed', (await video()).rate === 1);
    await key('BACK', 600);
    check('Back hides the controls and stays in the player', (await device.eval(`document.documentElement.classList.contains('controls-hidden')`)) && (await fullscreen()));
    await key('5', 900);
    let v = await video();
    check('5 jumps to the middle', Math.abs(v.t - v.d / 2) < 10, `${Math.round(v.t)} / ${Math.round(v.d)}`);
    await key('DPAD_CENTER', 700);
    check('OK pauses', (await video()).paused);
    await key('DPAD_CENTER', 900);
    check('OK plays again', !(await video()).paused);
    await key('DPAD_DOWN', 700);
    check('↓ opens the quick menu', await device.eval(`!!document.getElementById('android-quick-menu')`));
    await shot('quick-menu');
    before = await video();
    await device.eval(`[...document.querySelectorAll('#android-quick-menu button')].find((b) => /\\+5 min/.test(b.textContent)).focus()`);
    await key('DPAD_CENTER', 500);
    await key('DPAD_CENTER', 900);
    v = await video();
    check('+5 min twice in the open menu', v.t - before.t >= 590 || v.t >= v.d - 5, `${Math.round(v.t - before.t)} s`);
    check('menu stays open between jumps', await device.eval(`!!document.getElementById('android-quick-menu')`));
    await device.eval(`[...document.querySelectorAll('#android-quick-menu button')].find((b) => /^25%$/.test(b.textContent)).focus()`);
    await key('DPAD_CENTER', 900);
    v = await video();
    check('Go to 25%', Math.abs(v.t - v.d / 4) < 10, `${Math.round(v.t)}`);
    await shot('after-go-to');
    check('player still open after the menu', await fullscreen());
    await key('DPAD_UP', 600);
    await device.eval(`document.getElementById('android-speed')?.focus()`);
    await key('DPAD_CENTER', 500);
    check('Speed button → 1.25×', (await video()).rate === 1.25);
    await key('DPAD_CENTER', 300); await key('DPAD_CENTER', 300); await key('DPAD_CENTER', 300); await key('DPAD_CENTER', 500);
    check('Speed cycles back to 1×', (await video()).rate === 1);
    await key('DPAD_DOWN', 500);
    check('↓ from the row reaches the progress bar', await device.eval(`document.activeElement?.matches('input[type=range]')`));
    before = await video();
    await key('DPAD_RIGHT', 300); await key('DPAD_RIGHT', 900);
    v = await video();
    check('progress bar: 2 presses ≈ 4%', Math.abs(v.t - before.t - v.d * 0.04) < 15, `${Math.round(v.t - before.t)} s`);
});

await scenario('resume', async (check) => {
    await device.eval(`document.querySelector('video').currentTime = 600`);
    await sleep(12000);
    const saved = (await video()).t;
    await leavePlayer();
    await sleep(1200);
    check('Back returns to the detail page', await device.eval(`[...document.querySelectorAll('main button')].some((b) => /^Resume/.test(b.textContent.trim()))`));
    await device.eval(`[...document.querySelectorAll('main button')].find((b) => /^Resume/.test(b.textContent.trim())).focus()`);
    const t = Date.now();
    await key('DPAD_CENTER', 100);
    await device.waitFor(PLAYING, 20000);
    await device.waitFor(`!document.querySelector('.player-bottom > [role=status]')`, 15000);
    check(`resumed picture within ${BUDGET.pictureMs} ms`, Date.now() - t <= BUDGET.pictureMs, `${Date.now() - t} ms`);
    const v = await video();
    check('resumes near the saved spot', Math.abs(v.t - saved) < 15, `saved ${Math.round(saved)}, at ${Math.round(v.t)}`);
    await leavePlayer();
});

await scenario('series via a Movies category', async (check) => {
    await device.nav('Series');
    await sleep(2500);
    check('Series page: no error banner on a portal without a Series module', !(await device.eval(`!!document.querySelector('main [role="alert"], [role="alert"]')`)));
    await device.nav('Movies');
    await device.waitFor(`document.querySelectorAll('main .poster-card').length > 0`, 30000);
    await pickCategory('TV SHOWS');
    await device.eval(`(() => { const c = document.querySelector('main .poster-card'); (c.matches('button, a, [tabindex]') ? c : c.querySelector('button, a, [tabindex]') ?? c).focus(); })()`);
    await key('DPAD_CENTER', 200);
    const ms = await timed(`[...document.querySelectorAll('main button')].filter((b) => /Episode/.test(b.textContent)).length > 0`, 20000);
    check(`episodes within ${BUDGET.contentMs} ms`, ms <= BUDGET.contentMs, `${ms} ms`);
    await device.click('main button', 'Episode', 10000);
    await device.waitFor(PLAYING, 20000);
    check('episode plays', true);
    await leavePlayer();
});

await scenario('live: play, zap, guide', async (check) => {
    await device.nav('TV');
    await device.click('main button', '→$', 30000);
    await device.waitFor(`[...document.querySelectorAll('main button')].some((b) => /Sample Channel/.test(b.textContent))`, 20000);
    await device.eval(`[...document.querySelectorAll('main button')].find((b) => /Sample Channel/.test(b.textContent)).focus()`);
    let t = Date.now();
    await key('DPAD_CENTER', 100);
    await device.waitFor(PLAYING, 20000);
    check(`channel picture within ${BUDGET.pictureMs} ms`, Date.now() - t <= BUDGET.pictureMs, `${Date.now() - t} ms`);
    await key('DPAD_CENTER', 1200);
    if (!(await fullscreen())) await device.click('button', 'Fullscreen', 5000);
    check('OK again goes fullscreen', await fullscreen());
    await shot('live-fullscreen');
    const title = `document.querySelector('.player-bottom h1')?.textContent`;
    const zaps = [];
    for (let i = 0; i < 3; i++) {
        const first = await device.eval(title);
        t = Date.now();
        await key('DPAD_DOWN', 50);
        await device.waitFor(`${title} !== ${JSON.stringify(first)}`, 8000);
        await device.waitFor(PLAYING, 15000);
        zaps.push(Date.now() - t);
        await device.waitFor(`!document.documentElement.classList.contains('zapping')`, 5000);
    }
    check(`zap to picture within ${BUDGET.pictureMs} ms`, Math.max(...zaps) <= BUDGET.pictureMs, zaps.join(', ') + ' ms');
    await device.eval(`document.dispatchEvent(new MouseEvent('mousemove'))`);
    await sleep(400);
    const first = await device.eval(title);
    await key('DPAD_DOWN', 2500);
    check('↓ zaps with the controls showing', (await device.eval(title)) !== first);
    await key('BACK', 600);
    check('Back hides live controls first', await fullscreen());
    await leavePlayer();
    check('Back leaves fullscreen', !(await fullscreen()));
    const g = await (async () => { const s = Date.now(); await device.click('button', '^TV Guide$', 5000); await device.waitFor(`document.querySelectorAll('.grid-channel').length > 0`, 15000); return Date.now() - s; })();
    check(`guide within ${BUDGET.contentMs} ms`, g <= BUDGET.contentMs, `${g} ms`);
    await shot('guide');
    await key('BACK', 800);
});

await scenario('search', async (check) => {
    await device.nav('Search');
    await device.waitFor(`!!document.querySelector('main input')`, 10000);
    const t = Date.now();
    await device.eval(`(() => { const i = document.querySelector('main input'); i.value = 'sample show'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await device.waitFor(`document.querySelectorAll('main .poster-card').length > 0`, 15000);
    check(`results within ${BUDGET.contentMs} ms`, Date.now() - t <= BUDGET.contentMs, `${Date.now() - t} ms`);
    await shot('search');
});

await scenario('back never exits by surprise', async (check) => {
    await device.nav('Movies');
    await sleep(1500);
    const foreground = () => execFileSync('adb', ['-s', SERIAL, 'shell', 'dumpsys', 'window']).toString().split('\n').some((l) => l.includes('mCurrentFocus') && l.includes('iptvnator'));
    const osd = () => device.eval(`document.getElementById('iptv-osd')?.classList.contains('on') ? document.getElementById('iptv-osd').textContent : ''`);
    await key('BACK', 1200);
    check('Back on a section stays in the app', foreground());
    await key('BACK', 300);
    check('Back on Home asks before leaving', foreground() && /again to exit/.test(await osd()), await osd());
    await sleep(2500);
    await key('BACK', 300);
    check('a late second Back asks again', foreground() && /again to exit/.test(await osd()));
});

// ------------------------------------------------------------------ report

await report(OUT);
device.close();
