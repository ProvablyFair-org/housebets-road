// Fingerprints that bind a record to the code and data it ran against (14 Oct 2026). Plain JavaScript so the
// .mjs scripts (mutate, fresh-copy, build-standalone) and tests/verify.ts (and its bundle verify.js) share ONE definition.
//   codeFingerprint(root):   every file the verification depends on — src/, tests/, scripts/, data/, evidence/, profile/ (the
//                            vendored framework profile), package.json
//                            and the three pinned outputs — as sorted "path<TAB>sha256" lines, hashed. A mutation or
//                            fresh-copy record carries it; verify rejects a record whose fingerprint is not the current one.
//   sourceFingerprint(root): what verify.js is bundled from (tests/verify.ts, src/*.ts, this file). build-standalone writes it
//                            into verify.js's header; verify refuses a bundle whose header names other sources (ROAD-27).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const listed = (root, paths) => paths.map((p) => relative(root, p).split('\\').join('/')).sort().map((r) => `${r}\t${sha(readFileSync(join(root, r)))}`).join('\n') + '\n';

export const PINNED_OUTPUTS = ['outputs/simulation-results.json', 'outputs/rtp-claim-table.json', 'outputs/verification-results.json'];

export function codeFingerprint(root) {
  const files = [...['src', 'tests', 'scripts', 'data', 'evidence', 'profile'].flatMap((d) => walk(join(root, d))),
    ...['package.json', ...PINNED_OUTPUTS].map((f) => join(root, f)).filter((p) => existsSync(p))];
  return sha(listed(root, files));
}

export function sourceFingerprint(root) {
  const files = [join(root, 'tests', 'verify.ts'), join(root, 'scripts', 'fingerprint.mjs'), ...walk(join(root, 'src')).filter((p) => p.endsWith('.ts'))];
  return sha(listed(root, files));
}

/** The source fingerprint written in verify.js's header by scripts/build-standalone.mjs, or null. */
export function bundledSourceFingerprint(root) {
  const p = join(root, 'verify.js'); if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf8').slice(0, 2000).match(/Source fingerprint \(tests\/verify\.ts, src\/\*\.ts, scripts\/fingerprint\.mjs\): ([0-9a-f]{64})/);
  return m ? m[1] : null;
}
