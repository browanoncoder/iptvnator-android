// Builds the upstream IPTVnator TV client (apps/tv) at the commit pinned in upstream.json.
//
//   node scripts/build-client.mjs             build ../iptvnator (or $IPTVNATOR_DIR) as checked out
//   node scripts/build-client.mjs --checkout  clone/fetch and check out the pinned commit first (CI)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const { repository, ref } = JSON.parse(readFileSync('upstream.json', 'utf8'));
const dir = process.env.IPTVNATOR_DIR ?? '../iptvnator';
const checkout = process.argv.includes('--checkout');
const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

if (checkout) {
    if (!existsSync(`${dir}/.git`)) run('git', ['clone', '--filter=blob:none', repository, dir], '.');
    run('git', ['fetch', '--quiet', 'origin', ref]);
    run('git', ['checkout', '--quiet', '--detach', ref]);
} else if (!existsSync(`${dir}/.git`)) {
    throw new Error(`${dir} not found. Clone ${repository} there, or run with --checkout.`);
}
const head = git('rev-parse', 'HEAD');
if (head !== ref) console.warn(`warning: ${dir} is at ${head.slice(0, 9)}, upstream.json pins ${ref.slice(0, 9)}`);
run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['exec', 'nx', 'build', 'tv']);
console.log(`TV client built from ${head.slice(0, 9)} into ${dir}/dist/apps/tv`);
