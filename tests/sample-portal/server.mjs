// A local Stalker portal that behaves like the real providers we test against,
// so the app can be exercised end to end without hammering a provider (they
// allow one session per MAC and rate-limit). All titles are made up and all
// video is generated locally.
//
//   node tests/sample-portal/server.mjs            # http://0.0.0.0:3211
//   portal URL in the app: http://<host>:3211/stalker_portal/server/load.php
//
// Behaviours copied from a real portal:
// - 126 VOD categories, 14 items per page, films and lazy (Ministra) series
//   mixed in the VOD catalog;
// - `category=<id>&genre=<id>` answers an EMPTY list (the TV client's form),
//   `category=<id>&genre=0` (the desktop app's form) or `genre=<id>` filters,
//   and `category=<id>` alone ignores the filter;
// - the separate Series module answers `js:false`;
// - movies and episodes are HLS VOD (20 min, 6 s segments, via create_link);
//   live channels are a rolling HLS window.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MEDIA = join(ROOT, 'build/sample-media');
const PORT = Number(process.env.PORT ?? 3211);
const PAGE = 14;
const SEGMENT_S = 6;
const VOD_SECONDS = 1200;

// ---------------------------------------------------------------- media

function ensureMedia() {
    if (existsSync(join(MEDIA, 'vod/index.m3u8'))) return;
    mkdirSync(join(MEDIA, 'vod'), { recursive: true });
    console.log('Generating the 20-minute sample movie with ffmpeg (once)…');
    execFileSync('ffmpeg', [
        '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=25:duration=${VOD_SECONDS}`,
        '-f', 'lavfi', '-i', `sine=frequency=440:duration=${VOD_SECONDS}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
        '-g', '150', '-keyint_min', '150', '-sc_threshold', '0', '-b:v', '300k', '-maxrate', '400k', '-bufsize', '800k',
        '-c:a', 'aac', '-b:a', '48k', '-ac', '2',
        '-f', 'hls', '-hls_time', String(SEGMENT_S), '-hls_playlist_type', 'vod',
        '-hls_segment_filename', join(MEDIA, 'vod/seg%04d.ts'), join(MEDIA, 'vod/index.m3u8'),
    ]);
}

const SEGMENTS = () => readFileSync(join(MEDIA, 'vod/index.m3u8'), 'utf8').split('\n').filter((l) => l.endsWith('.ts')).length;

/** A live window over the VOD segments, moving with the wall clock. */
function livePlaylist() {
    const count = SEGMENTS();
    const sequence = Math.floor(Date.now() / 1000 / SEGMENT_S);
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${SEGMENT_S}`, `#EXT-X-MEDIA-SEQUENCE:${sequence}`, `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(sequence / count)}`];
    for (let i = 0; i < 5; i++) {
        const index = (sequence + i) % count;
        if (index === 0 && i > 0) lines.push('#EXT-X-DISCONTINUITY');
        lines.push(`#EXTINF:${SEGMENT_S}.000000,`, `vod/seg${String(index).padStart(4, '0')}.ts`);
    }
    return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- catalog

const LANGUAGES = ['ENGLISH', 'HINDI', 'TAMIL', 'TELUGU', 'MALAYALAM', 'PUNJABI', 'BANGLA', 'ARABIC', 'URDU', 'KANNADA', 'MARATHI', 'GUJARATI', 'FRENCH', 'SPANISH'];
const KINDS = ['MOVIES | LATEST', 'MOVIES | COLLECTION', 'MOVIES | 4K', 'TV SHOWS', 'SERIES', 'DUBBED', 'CLASSICS', 'KIDS', 'DOCUMENTARIES'];

function buildCatalog() {
    const categories = [{ id: '*', title: 'All', alias: '*', censored: 0 }];
    const items = [];
    let next = 900000;
    for (let i = 0; categories.length < 126; i++) {
        const language = LANGUAGES[i % LANGUAGES.length];
        const kind = KINDS[Math.floor(i / LANGUAGES.length) % KINDS.length];
        const id = String(i === 0 ? 1 : 20 + i * 3);
        const title = i === 125 ? 'SPORTING EVENTS' : `${language} | ${kind}`;
        categories.push({ id, title, alias: title.replace(/\W+/g, '_'), censored: 0 });
        // One empty category, like real catalogs have.
        const count = i === 7 ? 0 : 12 + ((i * 7) % 40);
        const series = /SERIES|TV SHOWS/.test(title);
        for (let n = 1; n <= count; n++) {
            const itemId = String(next++);
            items.push({
                id: itemId,
                name: `${series ? 'Sample Show' : 'Sample Film'} ${title.split(' | ')[0].toLowerCase()} ${n}`,
                o_name: '',
                description: `Generated ${series ? 'series' : 'film'} ${n} of ${title}.`,
                year: String(2000 + ((n * 3 + i) % 26)),
                category_id: id,
                genre_id: '0',
                added: new Date(Date.UTC(2026, 0, 1) + (count - n) * 86400000 + i * 3600000).toISOString().replace('T', ' ').slice(0, 19),
                time: String(VOD_SECONDS / 60),
                cmd: `/media/file_${itemId}.mpg`,
                screenshot_uri: '',
                is_series: series ? '1' : 0,
                rating_imdb: '7.1',
            });
        }
    }
    return { categories, items };
}

const catalog = buildCatalog();

const CHANNELS = Array.from({ length: 24 }, (_, i) => ({
    id: String(5000 + i),
    name: `Sample Channel ${i + 1}`,
    number: String(i + 1),
    tv_genre_id: String(1 + (i % 3)),
    cmd: `ffrt http://localhost/ch/${5000 + i}`,
    use_http_tmp_link: '1',
    use_load_balancing: '0',
    logo: '',
}));
const LIVE_GENRES = [
    { id: '*', title: 'All' },
    { id: '1', title: 'SAMPLE | NEWS' },
    { id: '2', title: 'SAMPLE | SPORTS' },
    { id: '3', title: 'SAMPLE | MOVIES' },
];

// ---------------------------------------------------------------- handlers

function page(rows, p) {
    const current = Math.max(1, Number(p) || 1);
    return { js: { total_items: String(rows.length), max_page_items: PAGE, selected_item: 0, cur_page: 0, data: rows.slice((current - 1) * PAGE, current * PAGE) } };
}

/** The real portal's category quirk (see the header comment). */
function vodRows(q) {
    const category = q.get('category') ?? '*';
    const genre = q.get('genre');
    let rows = catalog.items;
    if (category !== '*' && genre === category) rows = [];
    else if (genre && genre !== '0' && genre !== '*') rows = rows.filter((r) => r.category_id === genre);
    else if (category !== '*' && genre === '0') rows = rows.filter((r) => r.category_id === category);
    const search = (q.get('search') ?? '').toLowerCase();
    if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search));
    const sorted = [...rows];
    if (q.get('sortby') === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.added.localeCompare(a.added));
    return sorted;
}

/** Lazy Ministra seasons → episodes → file, under the VOD module. */
function seriesRows(q) {
    const movie = q.get('movie_id');
    const season = q.get('season_id');
    const episode = q.get('episode_id');
    if (episode) return [{ id: `f${episode}`, is_file: true, video_id: movie, series_id: episode, cmd: `/media/file_${movie}.mpg` }];
    if (season)
        return Array.from({ length: 6 }, (_, i) => ({ id: `${season}${i + 1}`, is_episode: true, series_number: String(i + 1), name: `Episode ${i + 1}`, description: 'Generated episode', duration: String(VOD_SECONDS / 60) }));
    return [1, 2].map((n) => ({ id: `${movie}s${n}`, video_id: movie, is_season: true, season_number: String(n), name: `Season ${n}` }));
}

function stalker(q, origin) {
    const type = q.get('type');
    const action = q.get('action');
    if (type === 'stb' && action === 'handshake') return { js: { token: 'SAMPLETOKEN0000000000000000000000', random: '0123456789abcdef0123456789abcdef01234567', not_valid: 0 } };
    if (type === 'stb' && action === 'get_profile') return { js: { id: '1', name: 'Sample STB', status: 0, blocked: '0', watchdog_timeout: 120, timeslot: 15, locale: 'en' } };
    if (type === 'series') return { js: false, text: 'generated in: 0.016s' };
    if (type === 'vod' && action === 'get_categories') return { js: catalog.categories };
    if (type === 'vod' && action === 'get_ordered_list') return page(q.get('movie_id') ? seriesRows(q) : vodRows(q), q.get('p'));
    if (type === 'itv' && action === 'get_genres') return { js: LIVE_GENRES };
    if (type === 'itv' && action === 'get_all_channels') return { js: { total_items: CHANNELS.length, max_page_items: CHANNELS.length, data: CHANNELS } };
    if (type === 'itv' && action === 'get_ordered_list') {
        const genre = q.get('genre') ?? '*';
        return page(genre === '*' ? CHANNELS : CHANNELS.filter((c) => c.tv_genre_id === genre), q.get('p'));
    }
    if (action === 'create_link') return { js: { cmd: type === 'itv' ? `${origin}/media/live.m3u8` : `${origin}/media/vod/index.m3u8`, streamer_id: '1', load: '', error: '' } };
    if (action === 'get_short_epg') return { js: [] };
    if (action === 'get_epg_info') return { js: { data: {} } };
    return { js: true };
}

// ---------------------------------------------------------------- server

ensureMedia();
createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const origin = `http://${req.headers.host}`;
    if (url.pathname.endsWith('/load.php') || url.pathname.endsWith('/portal.php')) {
        const body = JSON.stringify(stalker(url.searchParams, origin));
        console.log(`${new Date().toISOString().slice(11, 19)} ${url.searchParams.get('type')}/${url.searchParams.get('action')} ${['category', 'genre', 'movie_id', 'season_id', 'p'].map((k) => (url.searchParams.has(k) ? `${k}=${url.searchParams.get(k)}` : '')).filter(Boolean).join(' ')}`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' }); // real portals send JSON as text/html
        res.end(body);
        return;
    }
    if (url.pathname === '/media/live.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
        res.end(livePlaylist());
        return;
    }
    const file = url.pathname.match(/^\/media\/(vod\/(?:index\.m3u8|seg\d{4}\.ts))$/)?.[1];
    if (file && existsSync(join(MEDIA, file))) {
        res.writeHead(200, { 'Content-Type': file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' });
        res.end(readFileSync(join(MEDIA, file)));
        return;
    }
    res.writeHead(404).end();
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Sample portal on http://0.0.0.0:${PORT}/stalker_portal/server/load.php`);
    console.log(`${catalog.categories.length} VOD categories, ${catalog.items.length} titles, ${CHANNELS.length} live channels`);
});
