// Shared measuring and reporting for the experience audits (remote: ux-audit.mjs,
// touch: touch-audit.mjs). The page is instrumented once; every scenario then
// gets the same metrics:
//
//   response        key press or finished tap → first visible reaction (DOM, focus, media)
//   dead inputs     no visible reaction within 1 s
//   layout shift    CLS-style sum of movement the viewer did not cause
//                   (within 600 ms of a key, tap or click counts as caused;
//                   row recycling while a list scrolls is ignored)
//   focus loss      nothing focused on a remote-driven (TV) screen
//   false alarms    error banners on a healthy portal
import { mkdirSync, writeFileSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const BUDGET = { contentMs: 2500, pictureMs: 4000, keyMs: 150, shift: 0.05 };
export const PLAYING = `(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.readyState >= 3 && v.videoWidth > 0; })()`;
export const SAMPLE_PORTAL = 'http://10.0.2.2:3211/stalker_portal/server/load.php';
export const SAMPLE_MAC = '00:1A:79:12:34:56';

export const INSTRUMENT = `(() => {
  if (window.__ux) return;
  const ux = window.__ux = { scenario: 'start', shift: {}, focusLoss: {}, alerts: [], keys: [] };
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput && e.startTime - (ux.lastKeyAt || -1e9) > 600 && e.startTime - (ux.lastScrollAt || -1e9) > 400) { ux.shift[ux.scenario] = (ux.shift[ux.scenario] || 0) + e.value;
    if (e.value > 0.01) (ux.shifters = ux.shifters || []).push({ scenario: ux.scenario, value: +e.value.toFixed(3), after: (ux.lastKey || '') + '+' + Math.round(e.startTime - (ux.lastKeyAt || 0)) + 'ms', what: (e.sources || []).map((x) => x.node ? (x.node.className || x.node.nodeName).toString().slice(0, 40) : '?').join(', ') }); } }).observe({ type: 'layout-shift', buffered: false }); } catch {}
  // A virtual list recycles rows while scrolling; posters stay put on screen (checked), so it is not a jump.
  document.addEventListener('scroll', () => { ux.lastScrollAt = performance.now(); }, true);
  new MutationObserver(() => { document.querySelectorAll('[role="alert"]').forEach((a) => { if (a.__seen) return; a.__seen = true; ux.alerts.push({ scenario: ux.scenario, text: a.textContent.trim().slice(0, 90) }); }); })
    .observe(document.body, { subtree: true, childList: true });
  let lost = false;
  setInterval(() => {
    // Only a remote needs a focused element; on touch screens nothing focused is normal.
    const nothing = document.documentElement.classList.contains('form-tv') && (!document.activeElement || document.activeElement === document.body);
    const hiddenPlayer = document.querySelector('.player-controls.dormant') || document.documentElement.classList.contains('controls-hidden');
    if (nothing && !hiddenPlayer && !lost) ux.focusLoss[ux.scenario] = (ux.focusLoss[ux.scenario] || 0) + 1;
    lost = nothing && !hiddenPlayer;
  }, 250);
  let pending;
  const react = () => { if (!pending) return; ux.keys.push({ scenario: ux.scenario, key: pending.key + ' on "' + pending.on + '"', ms: Math.round(performance.now() - pending.t) }); pending = undefined; };
  const describe = (el) => ((el && (el.id || el.getAttribute && el.getAttribute('aria-label') || el.textContent)) || '').trim().slice(0, 24);
  const start = (label, on, track) => { ux.lastKey = label; ux.lastKeyAt = performance.now(); if (!track) return; react();
    const mine = pending = { key: label, t: performance.now(), on };
    setTimeout(() => { if (pending === mine) { ux.keys.push({ scenario: ux.scenario, key: label + ' on "' + on + '"', ms: null }); pending = undefined; } }, 1000); };
  // A click (OK on a focused button, or a scripted click) is user input too.
  window.addEventListener('click', () => { ux.lastKey = 'click'; ux.lastKeyAt = performance.now(); }, true);
  window.addEventListener('keydown', (e) => start(e.key, describe(document.activeElement), !e.repeat), true);
  // Taps are timed like keys; the audit marks gestures that are meant to do nothing visible.
  // Timed from the finger lifting (when a tap is complete), not from touching down.
  // A drag (finger moved) reacts while it moves, so only real taps are timed.
  // Sliders react as the finger lands (the thumb jumps, the seek starts): that counts as the response.
  let downAt, downT, downReactedAt;
  for (const type of ['input', 'seeking']) document.addEventListener(type, () => { if (downT !== undefined && downReactedAt === undefined) downReactedAt = performance.now(); }, true);
  window.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; downT = performance.now(); downReactedAt = undefined; ux.lastKey = 'tap'; ux.lastKeyAt = performance.now(); }, true);
  window.addEventListener('pointerup', (e) => { const moved = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 14; const early = downReactedAt; downT = undefined;
    if (moved) { ux.lastKeyAt = performance.now(); return; }
    if (early !== undefined && e.pointerType === 'touch') { react(); ux.keys.push({ scenario: ux.scenario, key: 'tap on slider', ms: 0 }); return; }
    start(window.__uxQuietTap ? 'quiet' : 'tap', describe(e.target.closest && e.target.closest('button, a, input, [role]') || e.target), !window.__uxQuietTap && e.pointerType === 'touch'); }, true);
  new MutationObserver(() => requestAnimationFrame(react)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  // Shell state (menu open, controls hidden) lives in classes on <html>.
  new MutationObserver(() => requestAnimationFrame(react)).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  for (const type of ['focusin', 'input', 'seeking', 'seeked', 'ratechange', 'pause', 'play', 'volumechange']) document.addEventListener(type, () => requestAnimationFrame(react), true);
})()`;

/** Runs scenarios against one device and writes a scored report. */
export function createAudit(device, title) {
    const results = [];
    async function scenario(name, run) {
        await device.eval(`window.__ux && (window.__ux.scenario = ${JSON.stringify(name)})`).catch(() => undefined);
        const checks = [];
        const check = (label, ok, detail = '') => checks.push({ label, ok: !!ok, detail: String(detail) });
        try {
            await run(check);
        } catch (error) {
            check('completed', false, String(error.message ?? error).slice(0, 160));
        }
        results.push({ name, checks });
    }

    async function report(out) {
        const ux = await device.eval('window.__ux').catch(() => ({ shift: {}, focusLoss: {}, alerts: [], keys: [] }));
        for (const r of results) addMetrics(r, ux);
        const all = results.flatMap((r) => r.checks);
        const passed = all.filter((c) => c.ok).length;
        const score = Math.round((passed / all.length) * 100);
        const lines = [`# ${title}`, '', `Score: **${score}%** (${passed}/${all.length} checks)`, ''];
        for (const r of results) {
            lines.push(`## ${r.name}`);
            for (const c of r.checks) lines.push(`- ${c.ok ? '✔' : '✖'} ${c.label}${c.detail !== '' ? ` — ${c.detail}` : ''}`);
            lines.push('');
        }
        const text = lines.join('\n');
        console.log(text);
        if (out) {
            mkdirSync(out, { recursive: true });
            writeFileSync(`${out}/ux-audit.md`, text);
            writeFileSync(`${out}/ux-audit.json`, JSON.stringify({ score, results }, null, 2));
        }
        return score;
    }

    return { scenario, report, results };
}

function addMetrics(r, ux) {
    const inputs = ux.keys.filter((k) => k.scenario === r.name);
    const timed = inputs.filter((k) => k.ms !== null).map((k) => k.ms).sort((a, b) => a - b);
    const p95 = timed.length ? timed[Math.min(timed.length - 1, Math.floor(timed.length * 0.95))] : null;
    const dead = inputs.filter((k) => k.ms === null).map((k) => k.key);
    const shift = +(ux.shift[r.name] ?? 0).toFixed(3);
    const focusLoss = ux.focusLoss[r.name] ?? 0;
    const alerts = ux.alerts.filter((a) => a.scenario === r.name).map((a) => a.text);
    r.metrics = { inputP95: p95, deadInputs: dead, shift, focusLoss, alerts };
    if (p95 !== null) r.checks.push({ label: `response p95 ≤ ${BUDGET.keyMs} ms`, ok: p95 <= BUDGET.keyMs, detail: `${p95} ms` });
    if (dead.length) r.checks.push({ label: 'every key / tap reacts', ok: false, detail: dead.join(', ') });
    const movers = (ux.shifters ?? []).filter((x) => x.scenario === r.name).map((x) => `${x.value} ${x.what} @${x.after}`).slice(0, 4).join('; ');
    r.checks.push({ label: `layout shift ≤ ${BUDGET.shift}`, ok: shift <= BUDGET.shift, detail: shift + (movers ? ` (${movers})` : '') });
    r.checks.push({ label: 'focus never lost', ok: focusLoss === 0, detail: focusLoss });
    r.checks.push({ label: 'no false alarms', ok: alerts.length === 0, detail: alerts.join(' | ') });
}

/** Adds the sample (or given) Stalker portal through the Sources form. */
export async function addPortal(device, url, mac) {
    await device.nav('Sources');
    await device.click('button', '^STALKER$');
    await device.waitFor(`!!document.querySelector('input[name="macAddress"]')`);
    await device.eval(`(() => { const set = (n, v) => { const i = document.querySelector('input[name="' + n + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
        set('name', 'Sample'); set('url', ${JSON.stringify(url)}); set('macAddress', ${JSON.stringify(mac)}); })()`);
    await device.click('button', '^Save and connect$');
    const t = Date.now();
    await device.waitFor(`[...document.querySelectorAll('button')].some((b) => /Sample/.test(b.textContent))`, 30000);
    return Date.now() - t;
}

/** Numbered screenshots into OUT/shots for the visual review (no-op without OUT). */
export function createShooter(device, out) {
    let n = 0;
    return async (name) => {
        if (!out) return;
        mkdirSync(`${out}/shots`, { recursive: true });
        await sleep(350);
        device.screenshot(`${out}/shots/${String(++n).padStart(2, '0')}-${name}.png`);
    };
}
