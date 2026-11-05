/**
 * Minimal on-screen display for playback feedback (seek, speed, play/pause).
 * Lives outside the client's #app root so the client's rendering never touches it.
 */
const HIDE_AFTER_MS = 1400;

const STYLE = `
#iptv-osd{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:2147483647;
  min-width:340px;padding:28px 40px;border-radius:24px;background:rgba(8,12,14,.78);
  color:#fff;font:600 44px/1.2 system-ui,Roboto,sans-serif;text-align:center;pointer-events:none;
  opacity:0;transition:opacity .18s ease;backdrop-filter:blur(8px)}
#iptv-osd.on{opacity:1}
#iptv-osd small{display:block;margin-top:10px;font-size:26px;font-weight:500;color:#b9d8cf}
#iptv-osd .bar{margin-top:18px;height:8px;border-radius:4px;background:rgba(255,255,255,.2);overflow:hidden}
#iptv-osd .bar i{display:block;height:100%;background:#7fe0c4}
`;

let root: HTMLDivElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function ensureRoot(): HTMLDivElement {
    if (root) return root;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.id = 'iptv-osd';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
}

export function showOsd(title: string, detail?: string, progress?: number): void {
    const el = ensureRoot();
    el.textContent = '';
    el.append(title);
    if (detail) {
        const small = document.createElement('small');
        small.textContent = detail;
        el.appendChild(small);
    }
    if (progress !== undefined && Number.isFinite(progress)) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
        bar.appendChild(fill);
        el.appendChild(bar);
    }
    el.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('on'), HIDE_AFTER_MS);
}
