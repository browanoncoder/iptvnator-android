// Drives the app's WebView on an emulator/device over the Chrome DevTools Protocol.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

export const APP_ID = 'com.iptvnator.androidtv.sample';
const ADB = process.env.ADB ?? `${homedir()}/Library/Android/sdk/platform-tools/adb`;

export function adb(serial, ...args) {
    return execFileSync(ADB, ['-s', serial, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Device {
    constructor(serial, port) {
        this.serial = serial;
        this.port = port;
        this.nextId = 0;
    }

    async launch({ clearData = false } = {}) {
        if (clearData) adb(this.serial, 'shell', 'pm', 'clear', APP_ID);
        adb(this.serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
        adb(this.serial, 'shell', 'am', 'start', '-S', '-n', `${APP_ID}/.MainActivity`);
        await this.connect();
        await this.waitFor(`!!document.querySelector('aside nav, nav')`, 20000);
    }

    async connect() {
        let pid = '';
        for (let i = 0; i < 40 && !pid; i++) {
            try {
                pid = adb(this.serial, 'shell', 'pidof', APP_ID).toString().trim();
            } catch {
                await sleep(250);
            }
        }
        adb(this.serial, 'forward', `tcp:${this.port}`, `localabstract:webview_devtools_remote_${pid}`);
        let page;
        for (let i = 0; i < 40 && !page; i++) {
            try {
                const pages = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
                page = pages.find((p) => p.type === 'page');
            } catch {
                /* devtools socket not ready yet */
            }
            if (!page) await sleep(250);
        }
        if (!page) throw new Error(`${this.serial}: WebView DevTools page not found`);
        this.ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
    }

    send(method, params = {}) {
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            const onMessage = (message) => {
                const data = JSON.parse(message.data);
                if (data.id !== id) return;
                this.ws.removeEventListener('message', onMessage);
                if (data.error) reject(new Error(data.error.message));
                else resolve(data.result);
            };
            this.ws.addEventListener('message', onMessage);
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        }
        return result.result.value;
    }

    async waitFor(expression, timeoutMs = 25000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const value = await this.eval(expression);
                if (value) return value;
            } catch {
                /* page reloading */
            }
            await sleep(400);
        }
        throw new Error(`${this.serial}: timed out waiting for ${expression}`);
    }

    /** Clicks the first element matching `selector` whose trimmed text satisfies `pattern`. */
    async click(selector, pattern, timeoutMs) {
        const source = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetWidth && new RegExp(${JSON.stringify(pattern)}).test(e.textContent.trim()))`;
        await this.waitFor(`!!${source}`, timeoutMs);
        await this.eval(`${source}.click()`);
    }

    async nav(label) {
        await this.click('aside nav button, nav button', `^${label}$`);
    }

    key(code) {
        adb(this.serial, 'shell', 'input', 'keyevent', code);
    }

    async holdKey(key, ms) {
        const keyCode = { ArrowRight: 39, ArrowLeft: 37 }[key];
        const base = { key, code: key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
        await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        const end = Date.now() + ms;
        while (Date.now() < end) {
            await sleep(50);
            await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...base });
        }
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }

    screenshot(path) {
        const raw = adb(this.serial, 'exec-out', 'screencap', '-p');
        // Multi-display devices (foldables) print a warning before the PNG data.
        const start = raw.indexOf(PNG_SIGNATURE);
        writeFileSync(path, start > 0 ? raw.subarray(start) : raw);
    }

    video() {
        return this.eval(`(() => { const v = document.querySelector('video'); return v && {
            t: v.currentTime, duration: v.duration, paused: v.paused, ready: v.readyState,
            rate: v.playbackRate, width: v.videoWidth, height: v.videoHeight,
            error: v.error && v.error.message } })()`);
    }

    close() {
        this.ws?.close();
    }
}
