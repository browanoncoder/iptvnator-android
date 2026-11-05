// Copies the built TV client into www/ and wires in the Android shell bundle.
import { cpSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const SOURCE = `${process.env.IPTVNATOR_DIR ?? '../iptvnator'}/dist/apps/tv`;
if (!existsSync(`${SOURCE}/index.html`)) {
    throw new Error(`Build the TV client first: ${SOURCE}/index.html is missing`);
}
rmSync('www', { recursive: true, force: true });
cpSync(SOURCE, 'www', { recursive: true });
cpSync('build/shell.js', 'www/shell.js');

const html = readFileSync('www/index.html', 'utf8');
const client = /<script defer src="([^"]+)"><\/script>/.exec(html);
if (!client) throw new Error('Unexpected TV index.html: client script tag not found');
const patched = html
    .replace('content="width=device-width,initial-scale=1"', 'content="width=1920"')
    // The shell starts the client after it has installed the on-device backend.
    .replace(client[0], `<script type="text/plain" data-tv-client="${client[1]}"></script>`)
    .replace('<title>', '<script src="./shell.js"></script><title>');
writeFileSync('www/index.html', patched);
console.log(`www/ ready (client ${client[1]})`);
