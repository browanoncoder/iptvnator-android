import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../../shell/src/embedded-backend';
import { installHttpMock } from './helpers';

const BASE = 'http://iptvnator.device';
const get = (path: string) => route('GET', new URL(BASE + path), undefined);

async function register(url: string): Promise<string> {
    const result = await route('POST', new URL(`${BASE}/provider-targets`), { url });
    assert.equal(result.status, 200);
    return (result.body as { targetId: string }).targetId;
}

describe('embedded backend', () => {
    test('answers the connection handshake', async () => {
        const result = await get('/tv/connection');
        assert.deepEqual(result.body, { service: 'iptvnator', protocol: 1, pairing: true, auth: 'none' });
        assert.equal(((await get('/tv/connection/check')).body as { connected: boolean }).connected, true);
    });

    test('rejects unsafe provider targets', async () => {
        for (const url of ['ftp://x/y', 'http://user:pw@host/', 'not a url']) {
            const result = await route('POST', new URL(`${BASE}/provider-targets`), { url });
            assert.equal(result.status, 400, url);
        }
        assert.equal((await route('POST', new URL(`${BASE}/provider-targets`), {})).status, 400);
    });

    test('re-registering the same URL reuses its target id', async () => {
        const a = await register('http://portal.test/stalker_portal/server/load.php');
        const b = await register('http://portal.test/stalker_portal/server/load.php');
        assert.equal(a, b);
    });

    test('unknown targets and routes are 404', async () => {
        assert.equal((await get('/stalker?targetId=missing&action=get_profile')).status, 404);
        assert.equal((await get('/nope')).status, 404);
    });

    test('stalker: MAC travels as a cookie header, never in the URL', async () => {
        const calls = installHttpMock(() => ({ status: 200, data: '{"js":{"token":"t"}}' }));
        const id = await register('http://portal.test/stalker_portal/server/load.php');
        const result = await get(`/stalker?targetId=${id}&action=get_profile&type=stb&macAddress=00:1A:79:00:00:04&token=abc`);
        assert.equal(result.status, 200);
        assert.deepEqual((result.body as { payload: unknown }).payload, { js: { token: 't' } });
        assert.equal(calls.length, 1);
        assert.doesNotMatch(calls[0].url, /00:1A:79|00%3A1A|macAddress|token=abc/i);
        assert.match(calls[0].headers['Cookie'] ?? '', /mac=00(%3A|:)1A/i);
        assert.match(calls[0].headers['Authorization'] ?? '', /Bearer abc/);
    });

    test('stalker: the handshake keeps its candidate token in the query', async () => {
        const calls = installHttpMock(() => ({ status: 200, data: '{}' }));
        const id = await register('http://portal.test/stalker_portal/server/load.php');
        await get(`/stalker?targetId=${id}&action=handshake&type=stb&macAddress=00:1A:79:00:00:04&token=cand`);
        assert.match(calls[0].url, /token=cand/);
    });

    test('provider errors come back as HTTP 200 with an error body', async () => {
        installHttpMock(() => ({ status: 403, data: 'Forbidden' }));
        const id = await register('http://portal.test/stalker_portal/server/load.php');
        const result = await get(`/stalker?targetId=${id}&action=get_profile&macAddress=00:1A:79:00:00:04`);
        assert.equal(result.status, 200);
        assert.equal((result.body as { status: number }).status, 403);
    });

    test('xtream: calls player_api.php with the query and user agent', async () => {
        const calls = installHttpMock(() => ({ status: 200, data: '[{"category_id":"1"}]' }));
        const id = await register('http://xtream.test:8080/');
        const result = await get(`/xtream?targetId=${id}&action=get_vod_categories&username=u&password=p&userAgent=Box`);
        assert.deepEqual((result.body as { payload: unknown }).payload, [{ category_id: '1' }]);
        const url = new URL(calls[0].url);
        assert.equal(url.pathname, '/player_api.php');
        assert.equal(url.searchParams.get('action'), 'get_vod_categories');
        assert.equal(url.searchParams.get('userAgent'), null);
        assert.equal(calls[0].headers['User-Agent'], 'Box');
    });

    test('xtream: a failed connection test reports a connection failure', async () => {
        installHttpMock(() => new Error('ECONNREFUSED'));
        const id = await register('http://down.test/');
        const result = await get(`/xtream?targetId=${id}&connectionTest=true`);
        assert.deepEqual(result.body, { connectionFailure: { kind: 'connection', canTryHttp: false } });
    });

    test('m3u: parses a playlist into channels', async () => {
        const m3u = '#EXTM3U\n#EXTINF:-1 tvg-id="a" group-title="News",Alpha\nhttp://s/a.m3u8\n#EXTINF:-1,Beta\nhttp://s/b.m3u8\n';
        installHttpMock(() => ({ status: 200, data: m3u }));
        const id = await register('http://lists.test/list.m3u');
        const result = await get(`/parse?targetId=${id}`);
        assert.equal(result.status, 200);
        const text = JSON.stringify(result.body);
        assert.match(text, /Alpha/);
        assert.match(text, /Beta/);
    });
});
