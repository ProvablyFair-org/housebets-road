#!/usr/bin/env node
// Builds site-verifier/derive.js: the module for the ProvablyFair.org verifier page of this game, generated from
// src/rng.ts (and the files it imports) and from nothing else.
//
//     node scripts/build-site-verifier.mjs           build, write site-verifier/derive.js, print its sha256
//     node scripts/build-site-verifier.mjs --pin     the same, and write the sha256 into SITE_VERIFIER_PIN (src/artifact-pins.ts)
//     node scripts/build-site-verifier.mjs --check   rebuild in a throwaway folder; exit 1 unless the rebuild equals the file
//                                                    on disk byte for byte and its sha256 equals SITE_VERIFIER_PIN
//
// What the module is: one ES module with no import, exporting the functions of src/rng.ts under the same names. It runs in a
// browser and in Node. src/rng.ts takes HMAC-SHA256 and SHA-256 from node:crypto and its byte arrays from Node's Buffer; a
// browser has neither, so the build swaps that one import for the small implementation below (CRYPTO_SHIM: SHA-256, HMAC and
// the three Buffer calls the sources use). Nothing else of the sources is changed. That the swap changes no result is not
// assumed: check 24 of tests/verify.ts runs the built module and src/rng.ts side by side on every captured round.
//
// Same sources, same bytes: the build runs in a throwaway folder with a fixed layout (no path of this machine reaches the
// output), the bundler version is fixed (BUN_VERSION; another version is refused, because it may name local variables
// differently), and the header carries the sources' sha256 and no time, host or user.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, createHmac } from 'node:crypto';

// ── the settings (each in one place) ─────────────────────────────────────────────────────────────────────────────────
const BUN_VERSION = '1.3.9';                         // the bundler of record
const OUT = 'site-verifier/derive.js';               // the shipped module
const PIN_FILE = 'src/artifact-pins.ts';             // holds: export const SITE_VERIFIER_PIN = ['site-verifier/derive.js', '<sha256>']
/** game (package.json name housebets-<game>-audit) -> the entry whose exports become the module's exports. */
const ENTRIES = {
  baccarat: 'src/rng.ts', blackjack: 'src/rng.ts', coinflip: 'src/rng.ts', dice: 'src/rng.ts', hilo: 'src/rng.ts', keno: 'src/rng.ts',
  limbo: 'src/rng.ts', mines: 'src/rng.ts', plinko: 'src/rng.ts', road: 'src/rng.ts', roulette: 'src/rng.ts',
};

// ── the replacement for node:crypto and Buffer inside the module ─────────────────────────────────────────────────────
// SHA-256 (FIPS 180-4) and HMAC (RFC 2104) on Uint8Array, and the Buffer surface the sources use: Buffer.from(text, 'utf8'),
// Buffer.concat(list), .readUInt32BE(offset), .toString('hex'), createHash('sha256').update(x[, 'utf8']).digest(['hex']),
// createHmac('sha256', key).update(x).digest(['hex']). Any other call throws by name instead of answering wrongly.
const CRYPTO_SHIM = `const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

/** A byte array with the three Buffer methods the sources use. */
class PfBytes extends Uint8Array {
  static from(value: string | ArrayLike<number>, encoding?: string): PfBytes {
    if (typeof value === 'string') {
      if (encoding !== undefined && encoding !== 'utf8' && encoding !== 'utf-8') throw new Error('site-verifier: text encoding not supported: ' + encoding);
      const b = new TextEncoder().encode(value); const out = new PfBytes(b.length); out.set(b); return out;
    }
    const out = new PfBytes(value.length); out.set(value); return out;
  }
  static concat(list: ArrayLike<number>[]): PfBytes {
    let n = 0; for (const x of list) n += x.length;
    const out = new PfBytes(n); let o = 0; for (const x of list) { out.set(x, o); o += x.length; }
    return out;
  }
  readUInt32BE(offset = 0): number {
    if (!Number.isInteger(offset) || offset < 0 || offset + 4 > this.length) throw new RangeError('site-verifier: readUInt32BE offset out of range: ' + offset);
    return ((this[offset] * 16777216) + ((this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3])) >>> 0;
  }
  toString(encoding?: string): string {
    if (encoding !== 'hex') throw new Error('site-verifier: toString encoding not supported: ' + encoding);
    let s = ''; for (let i = 0; i < this.length; i++) s += (this[i] < 16 ? '0' : '') + this[i].toString(16);
    return s;
  }
}

function sha256Bytes(msg: Uint8Array): PfBytes {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const n = msg.length, total = (((n + 9) >> 6) + (((n + 9) & 63) ? 1 : 0)) << 6;
  const p = new Uint8Array(total); p.set(msg); p[n] = 0x80;
  const bitsHi = Math.floor(n / 536870912), bitsLo = (n << 3) >>> 0;
  p[total - 8] = bitsHi >>> 24; p[total - 7] = bitsHi >>> 16; p[total - 6] = bitsHi >>> 8; p[total - 5] = bitsHi;
  p[total - 4] = bitsLo >>> 24; p[total - 3] = bitsLo >>> 16; p[total - 2] = bitsLo >>> 8; p[total - 1] = bitsLo;
  const w = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = ((p[o + 4 * i] << 24) | (p[o + 4 * i + 1] << 16) | (p[o + 4 * i + 2] << 8) | p[o + 4 * i + 3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + k) >>> 0;
  }
  const out = new PfBytes(32);
  for (let i = 0; i < 8; i++) { out[4 * i] = h[i] >>> 24; out[4 * i + 1] = (h[i] >>> 16) & 255; out[4 * i + 2] = (h[i] >>> 8) & 255; out[4 * i + 3] = h[i] & 255; }
  return out;
}

function toBytes(data: string | Uint8Array, encoding?: string): Uint8Array {
  if (typeof data === 'string') return PfBytes.from(data, encoding);
  return data;
}
function join2(a: Uint8Array, b: Uint8Array): Uint8Array { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; }

class PfHash {
  private parts: Uint8Array = new Uint8Array(0);
  private key: Uint8Array | null;
  constructor(key: Uint8Array | null) { this.key = key; }
  update(data: string | Uint8Array, encoding?: string): this { this.parts = join2(this.parts, toBytes(data, encoding)); return this; }
  digest(encoding?: string): any {
    let d: PfBytes;
    if (this.key === null) d = sha256Bytes(this.parts);
    else {
      const k0 = this.key.length > 64 ? sha256Bytes(this.key) : this.key;
      const ipad = new Uint8Array(64).fill(0x36), opad = new Uint8Array(64).fill(0x5c);
      for (let i = 0; i < k0.length; i++) { ipad[i] ^= k0[i]; opad[i] ^= k0[i]; }
      d = sha256Bytes(join2(opad, sha256Bytes(join2(ipad, this.parts))));
    }
    if (encoding === undefined) return d;
    return d.toString(encoding);
  }
}
const onlySha256 = (algorithm: string): void => { if (algorithm !== 'sha256') throw new Error('site-verifier: algorithm not supported: ' + algorithm); };
export function createHash(algorithm: string): PfHash { onlySha256(algorithm); return new PfHash(null); }
export function createHmac(algorithm: string, key: string | Uint8Array): PfHash { onlySha256(algorithm); return new PfHash(toBytes(key, 'utf8')); }
export { PfBytes as Buffer };
`;
const SHIM_FILE = 'src/site-verifier-crypto.ts';     // exists only inside the throwaway build folder

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const die = (msg) => { console.error(`[build-site-verifier] FAILED: ${msg}`); process.exit(1); };
const args = process.argv.slice(2);
for (const a of args) if (!['--pin', '--check'].includes(a)) die(`unknown argument ${a}`);
const CHECK = args.includes('--check'), PIN = args.includes('--pin');
if (CHECK && PIN) die('--check never writes: do not combine it with --pin');

const game = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name.match(/^housebets-([a-z]+)-audit$/) || [])[1];
const ENTRY = ENTRIES[game];
if (!ENTRY) die(`no entry listed for the package "${game}" (ENTRIES)`);

/** The entry and every file it reaches through relative imports. Any other import is refused, except the one of node:crypto. */
const CRYPTO_IMPORT = /^import \{ ([A-Za-z, ]+) \} from 'node:crypto';$/m;
function collect(entry) {
  const seen = new Map();   // posix path relative to ROOT -> rewritten text
  const walk = (rel) => {
    if (seen.has(rel)) return;
    if (!existsSync(join(ROOT, rel))) die(`${rel} not found`);
    let text = readFileSync(join(ROOT, rel), 'utf8');
    const specs = [...text.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
      .concat([...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]));
    if (/\bimport\s*\(|\brequire\s*\(/.test(text)) die(`${rel} uses a dynamic import or require: not supported in the site module`);
    seen.set(rel, null);
    for (const s of specs) {
      if (s === 'node:crypto') continue;
      if (!s.startsWith('./') && !s.startsWith('../')) die(`${rel} imports "${s}": only relative files and node:crypto can go into the site module`);
      walk(posix.normalize(posix.join(posix.dirname(rel), s)));
    }
    if (specs.includes('node:crypto')) {
      const m = text.match(CRYPTO_IMPORT);
      if (!m) die(`${rel}: the node:crypto import is not in the form  import { createHmac, createHash } from 'node:crypto';`);
      const names = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      const bad = names.filter((x) => !['createHmac', 'createHash'].includes(x));
      if (bad.length) die(`${rel} takes ${bad.join(', ')} from node:crypto: the site module provides createHmac and createHash only`);
      const to = posix.relative(posix.dirname(rel), SHIM_FILE);
      text = text.replace(CRYPTO_IMPORT, `import { ${names.join(', ')}, Buffer } from '${to.startsWith('.') ? to : './' + to}';`);
    } else if (/\bBuffer\s*\./.test(text)) die(`${rel} uses Buffer without importing node:crypto: add it to the build's handling before shipping`);
    seen.set(rel, text);
  };
  walk(entry);
  return seen;
}
const exportNames = (text) => [...text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).sort();

/** Build in a throwaway folder; returns the module text. */
function build() {
  const v = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  const have = (v.stdout || '').trim();
  if (v.status !== 0 || !have) die(`bun not found: the module is built with bun ${BUN_VERSION}`);
  if (have !== BUN_VERSION) die(`this machine has bun ${have}; the module of record is built with bun ${BUN_VERSION} (another version can produce different bytes)`);
  const sources = collect(ENTRY);
  const dir = mkdtempSync(join(tmpdir(), 'pf-site-verifier-'));
  try {
    for (const [rel, text] of sources) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
    writeFileSync(join(dir, SHIM_FILE), CRYPTO_SHIM);
    const r = spawnSync('bun', ['build', ENTRY, '--target=browser', '--format=esm', '--outfile=out/derive.js'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    if (r.status !== 0) die(`bun build: ${(r.stderr || r.stdout || '').trim()}`);
    const body = readFileSync(join(dir, 'out', 'derive.js'), 'utf8');
    const listed = [...sources.keys()].sort().map((rel) => ` *   ${rel}  sha256 ${sha(readFileSync(join(ROOT, rel)))}`).join('\n');
    const header = `/**
 * ${OUT} — the module for the ProvablyFair.org verifier page, HouseBets ${game} (House Games, new engine).
 * Generated by scripts/build-site-verifier.mjs with bun ${BUN_VERSION}; do not edit. Rebuild: npm run build:site-verifier
 * Built from:
${listed}
 * No import: SHA-256 and HMAC-SHA256 are implemented inside this file, so it runs in a browser and in Node.
 * The exports are the exports of ${ENTRY}, under the same names. Functions that return a Buffer in ${ENTRY} return
 * a Uint8Array here, with readUInt32BE(offset) and toString('hex').
 */
`;
    return { text: header + body, sources };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Fails unless the module is self-contained and exports what the entry exports. */
async function inspect(text, sources) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // header and bun's "// src/…" path lines out
  const leaks = [
    [/^\s*import\b/m, 'an import statement'], [/\bimport\s*\(/, 'a dynamic import'], [/\bimport\.meta\b/, 'import.meta'], [/\brequire\s*\(/, 'a require call'],
    [/\bfrom\s*["'`]/, 'a "from" clause'], [/\bBuffer\b/, 'Node\'s Buffer'], [/\bprocess\s*\./, 'Node\'s process'], [/\b__dirname\b|\b__filename\b/, 'a Node path global'],
    [/node:/, 'a node: specifier'],
  ].filter(([re]) => re.test(code)).map(([, what]) => what);
  if (leaks.length) die(`the built module is not self-contained: it holds ${leaks.join(', ')}`);
  if (/\/Users\/|\/home\/|\/tmp\/|\/var\/|[A-Za-z]:\\\\/.test(text)) die('the built module holds a path of this machine');
  const dir = mkdtempSync(join(tmpdir(), 'pf-site-verifier-load-'));
  try {
    writeFileSync(join(dir, 'derive.mjs'), text);
    const mod = await import(pathToFileURL(join(dir, 'derive.mjs')).href);
    const want = exportNames(sources.get(ENTRY)), got = Object.keys(mod).sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) die(`exports differ from ${ENTRY}: module [${got.join(', ')}], source [${want.join(', ')}]`);
    // the module's own SHA-256 and HMAC against Node's, on inputs around the block boundaries (55, 56, 64 bytes) and a long key
    if (typeof mod.sha256Hex === 'function') {
      for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(119), 'a'.repeat(1000), 'ç€𝄞']) {
        if (mod.sha256Hex(s) !== createHash('sha256').update(s, 'utf8').digest('hex')) die(`the module's sha256Hex differs from Node's on a ${s.length}-character input`);
      }
    }
    if (typeof mod.hmacBlock === 'function') {
      for (const [k, c] of [['', ''], ['key', 'client'], ['k'.repeat(64), 'c'.repeat(40)], ['k'.repeat(65), 'c'.repeat(200)], ['ç€𝄞', 'ç€𝄞']]) {
        const a = mod.hmacBlock(k, c, 7, 1), b = createHmac('sha256', Buffer.from(k, 'utf8')).update(`${c}:7:1`).digest();
        if (a.toString('hex') !== b.toString('hex') || a.readUInt32BE(4) !== b.readUInt32BE(4)) die(`the module's hmacBlock differs from Node's (key of ${k.length} characters)`);
      }
    }
    return got;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function readPin() {
  const t = readFileSync(join(ROOT, PIN_FILE), 'utf8');
  const m = [...t.matchAll(/(SITE_VERIFIER_PIN[^=\n]*= \['site-verifier\/derive\.js', ')([0-9a-f]{64})(')/g)];
  if (m.length !== 1) die(`${PIN_FILE} must hold exactly one  SITE_VERIFIER_PIN … = ['${OUT}', '<64 hex>']  (found ${m.length})`);
  return { text: t, match: m[0] };
}

const { text, sources } = build();
const names = await inspect(text, sources);
const digest = sha(text);
const target = join(ROOT, OUT);
if (CHECK) {
  const onDisk = existsSync(target) ? readFileSync(target) : null;
  const same = onDisk !== null && onDisk.equals(Buffer.from(text, 'utf8'));
  const pin = readPin().match[2];
  const pinOk = pin === digest;
  console.log(`[build-site-verifier] ${same && pinOk ? 'OK' : 'DIFFERS'}: ${OUT} rebuilt from ${[...sources.keys()].sort().join(', ')} with bun ${BUN_VERSION}: sha256 ${digest}; `
    + `${onDisk === null ? 'no file on disk' : same ? 'the file on disk equals the rebuild byte for byte' : `the file on disk DIFFERS from the rebuild (its sha256 ${sha(onDisk)})`}; `
    + `SITE_VERIFIER_PIN ${pinOk ? '== that sha256' : `is ${pin}, NOT that sha256`}`);
  process.exit(same && pinOk ? 0 : 1);
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, text);
if (PIN) {
  const { text: pins, match } = readPin();
  if (match[2] !== digest) writeFileSync(join(ROOT, PIN_FILE), pins.replace(match[0], match[1] + digest + match[3]));
  console.log(`wrote ${OUT} (${Buffer.byteLength(text)} bytes, sha256 ${digest}; exports ${names.join(', ')}); SITE_VERIFIER_PIN in ${PIN_FILE} ${match[2] === digest ? 'already holds it' : 'updated'}`);
} else console.log(`wrote ${OUT} (${Buffer.byteLength(text)} bytes, sha256 ${digest}; exports ${names.join(', ')})`);
