/**
 * Android shell bootstrap. Runs before the TV client and:
 *  1. answers backend requests on-device (no server needed),
 *  2. maps webOS.platformBack() to the native shell,
 *  3. points fresh/unconfigured installs at the on-device backend,
 *  4. then starts the TV client.
 */
import { EMBEDDED_BACKEND_URL, installEmbeddedBackend } from './embedded-backend';

const USER_DB = 'iptvnator-tv-user-data';
const USER_DB_VERSION = 1;

interface StoredUserData {
    version: number;
    data: Record<string, unknown>;
}

function installBackShim(): void {
    const w = window as unknown as {
        webOS?: { platformBack?: () => void };
        IptvnatorAndroid?: { exitApp(): void };
    };
    if (w.webOS?.platformBack) return;
    w.webOS = { platformBack: () => w.IptvnatorAndroid?.exitApp() };
}

/**
 * The client stores its backend URL in IndexedDB. Use the on-device backend
 * unless the user explicitly configured a remote one.
 */
function ensureEmbeddedBackend(): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.open(USER_DB, USER_DB_VERSION);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => resolve();
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('state', 'readwrite');
            const store = tx.objectStore('state');
            const read = store.get('user');
            read.onsuccess = () => {
                const saved = read.result as StoredUserData | undefined;
                const backend = saved?.data?.['backend'];
                if (typeof backend === 'string' && backend && backend !== EMBEDDED_BACKEND_URL) return;
                if (saved && backend === EMBEDDED_BACKEND_URL) return;
                // Unconfigured: hydrateUserData() fills every other field with defaults.
                const data = { ...(saved?.data ?? {}), backend: EMBEDDED_BACKEND_URL, backendToken: '' };
                store.put({ version: USER_DB_VERSION, data }, 'user');
            };
            tx.oncomplete = tx.onerror = tx.onabort = () => {
                db.close();
                resolve();
            };
        };
    });
}

function startClient(): void {
    const placeholder = document.querySelector<HTMLScriptElement>('script[data-tv-client]');
    const src = placeholder?.getAttribute('data-tv-client');
    if (!src) throw new Error('TV client script not found');
    const script = document.createElement('script');
    script.src = src;
    document.head.appendChild(script);
}

installEmbeddedBackend();
installBackShim();
ensureEmbeddedBackend().finally(startClient);
