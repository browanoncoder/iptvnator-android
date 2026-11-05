/**
 * Android platform integration for the TV client (written for LG webOS).
 *
 * - Back: webOS.platformBack() sends the app to the background.
 * - Media keys: Android remote/keyboard media keys are translated to the webOS
 *   key codes the client already handles (play 415, pause 19, stop 413,
 *   rewind 412, fast-forward 417).
 * - Screen saver: the screen is kept on only while a video is playing, so the
 *   Android TV ambient mode / phone screen timeout cannot interrupt playback.
 */
interface AndroidShell {
    exitApp(): void;
    setKeepScreenOn(on: boolean): void;
}

const WEBOS_KEY = { play: 415, pause: 19, stop: 413, rewind: 412, fastForward: 417 } as const;

function shell(): AndroidShell | undefined {
    return (window as unknown as { IptvnatorAndroid?: AndroidShell }).IptvnatorAndroid;
}

function installBack(): void {
    const w = window as unknown as { webOS?: { platformBack?: () => void } };
    if (w.webOS?.platformBack) return;
    w.webOS = { platformBack: () => shell()?.exitApp() };
}

function activeVideo(): HTMLVideoElement | null {
    return document.querySelector('video');
}

function webOsCodeFor(event: KeyboardEvent): number | undefined {
    switch (event.key) {
        case 'MediaPlayPause': {
            const video = activeVideo();
            return video && !video.paused ? WEBOS_KEY.pause : WEBOS_KEY.play;
        }
        case 'MediaPlay':
            return WEBOS_KEY.play;
        case 'MediaPause':
            return WEBOS_KEY.pause;
        case 'MediaStop':
            return WEBOS_KEY.stop;
        case 'MediaRewind':
        case 'MediaTrackPrevious':
            return WEBOS_KEY.rewind;
        case 'MediaFastForward':
        case 'MediaTrackNext':
            return WEBOS_KEY.fastForward;
        default:
            return undefined;
    }
}

/** Re-dispatches media keys with the webOS keyCode the client's remote handler expects. */
function installMediaKeys(): void {
    document.addEventListener(
        'keydown',
        (event) => {
            if ((event as KeyboardEvent & { __translated?: boolean }).__translated) return;
            const code = webOsCodeFor(event);
            if (code === undefined) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const translated = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
            Object.defineProperty(translated, 'keyCode', { value: code });
            Object.defineProperty(translated, '__translated', { value: true });
            (document.activeElement ?? document).dispatchEvent(translated);
        },
        true
    );
}

/** Media events do not bubble, so listen in the capture phase on the document. */
function installKeepScreenOn(): void {
    let current = false;
    const update = () => {
        const video = activeVideo();
        const playing = !!video && !video.paused && !video.ended;
        if (playing === current) return;
        current = playing;
        shell()?.setKeepScreenOn(playing);
    };
    ['playing', 'pause', 'ended', 'emptied', 'error'].forEach((name) =>
        document.addEventListener(name, update, true)
    );
}

export function installTvPlatform(): void {
    installBack();
    installMediaKeys();
    installKeepScreenOn();
}
