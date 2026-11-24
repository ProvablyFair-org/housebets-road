#!/usr/bin/env node
// The falsifiability battery (ROAD-29): every mutation in tests/mutations.json is applied to a throwaway copy of the
// package, verify runs there, and the mutation is KILLED when the check it names ends with a status different from the
// same check's status in an UNMUTATED copy run the same way (13 Oct 2026). A check whose row is missing
// (verify aborted before it) or a mutation that errors counts as a SURVIVOR, never as a kill.
// A row printed as NOTRUN (a scored check the profile lists but the run never recorded) is a status like any other.
// Writes outputs/run/mutation-results.json and, for a full run, the committed record outputs/mutation-results.json, which
// carries the code fingerprint it ran against (scripts/fingerprint.mjs) and is pinned in RELEASE-MANIFEST.json.
// ROAD-29 reads only that committed record and rejects it when its fingerprint, registry or counts do not match.
// Since 14 Oct 2026 a mutation may carry expectExit (the exit code the run must end with) as well as expectVerdict; a kill
// then also requires that exit. 'also' applies further text edits to other files (a step deleted from tests/verify.ts AND its
// row from src/profile-map.ts). 'regen' is one step or a list, run in order: 'rtp-table' (npm run rtp-claim:write in the copy,
// re-pinned), 'record' (the committed record regenerated and re-pinned, verify.js rebuilt), 'simulate'. The baseline map leaves
// out ROAD-28 and ROAD-29, whose status depends on the records themselves.
// 'repinPackage': true (with 'repin') also replaces the mutated file's sha256 in the copy's RELEASE-MANIFEST.json, MANIFEST.md
// and README.md, so every place that holds it follows the forgery (M24a).
// Runs PF_MUT_JOBS copies at a time (default 6).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { codeFingerprint } from './fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = codeFingerprint(ROOT);   // taken before anything runs; the record is valid only for this code and data
const reg = JSON.parse(readFileSync(join(ROOT, 'tests', 'mutations.json'), 'utf8'));
const only = process.argv.slice(2);
const list = reg.mutations.filter((m) => !only.length || only.includes(m.id));
const JOBS = Number(process.env.PF_MUT_JOBS || 6);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const NODE = ['--experimental-strip-types', '--no-warnings', '--import', './scripts/ts-resolve.mjs'];

function walk(obj, path) {   // "bets[7]._raw.round.payout" -> [parent, key]
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let o = obj; for (const p of parts.slice(0, -1)) o = o[p];
  return [o, parts[parts.length - 1]];
}
const addDec = (x, d) => { const s = typeof x === 'string'; const v = Math.round((Number(x) + d) * 1e8) / 1e8; return s ? v.toFixed(8) : v; };
// 'rm' deletes 'file' from the copy (an artifact of record that is simply absent). 'truncate' keeps the first
// floor(n * value) records of the array at 'path' and, with 'coherent', sets every other count in the file that equalled n to
// the new length (a population shrink with a header that agrees). 'null' sets each of 'keys' to null in every record of the
// array at 'path' (every reveal withheld). Added 30 Oct 2026: a verifier that throws on one of these prints no row for the
// check it names, and this battery scores that as a survivor.
function truncateAt(root, arr, value, coherent) {
  if (!Array.isArray(arr)) throw new Error('truncate: path is not an array');
  const n0 = arr.length, n1 = Math.floor(n0 * value); arr.length = n1;
  if (coherent) (function fix(o) { if (!o || typeof o !== 'object' || o === arr) return; for (const q of Object.keys(o)) { if (o[q] === n0) o[q] = n1; else if (o[q] === String(n0)) o[q] = String(n1); else fix(o[q]); } })(root);
}
function nullKeys(arr, keys) {
  if (!Array.isArray(arr)) throw new Error('null: path is not an array');
  let n = 0; for (const r of arr) for (const q of keys) if (r && typeof r === 'object' && q in r) { r[q] = null; n++; }
  if (!n) throw new Error('null: no record carries ' + keys.join('/'));
}
function repinAll(dir, oldSha, newSha) {
  for (const f of readdirSync(join(dir, 'src'))) { const p = join(dir, 'src', f); const t = readFileSync(p, 'utf8'); if (t.includes(oldSha)) writeFileSync(p, t.split(oldSha).join(newSha)); }
}
const run = (dir, args) => new Promise((res) => { const c = spawn(process.execPath, [...NODE, ...args], { cwd: dir }); let out = ''; c.stdout.on('data', (d) => out += d); c.stderr.on('data', (d) => out += d); c.on('close', (code) => res({ code, out })); });

// a status keeps its origin marker: "FLAG*" (capture-origin) and "FLAG" (operator) are different statuses
const statusesOf = (out) => { const s = {}; for (const l of out.split('\n')) { const x = l.trim().match(/^([A-Z]+-\d+)\s+(PASS|FAIL|FLAG|GAP|INFO|NOTRUN|OVERSTATED)(\*?)\s/); if (x) s[x[1]] = x[2] + x[3]; } return s; };
async function baselineStatuses() {   // the same copy procedure with no mutation applied
  const dir = mkdtempSync(join(tmpdir(), `hbroad-baseline-`));
  try { cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.includes(join('outputs', 'run')) && !s.includes('node_modules') }); return statusesOf((await run(dir, ['tests/verify.ts'])).out); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const BASE = await baselineStatuses();
delete BASE['ROAD-28']; delete BASE['ROAD-29'];
console.log(`unmutated copy: ${Object.keys(BASE).length} check rows; scored-check statuses ${Object.entries(BASE).map(([k, v]) => `${k} ${v}`).join(', ')}`);

async function one(m) {
  const dir = mkdtempSync(join(tmpdir(), `hbroad-${m.id}-`));
  try {
    cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.includes(join('outputs', 'run')) && !s.includes('node_modules') });
    const fp = join(dir, m.file); const before = readFileSync(fp);
    if (m.op === 'rm') rmSync(fp);
    else if (m.op === 'text') {
      const t = before.toString('utf8'); if (!t.includes(m.find)) throw new Error(`${m.id}: text not found`);
      writeFileSync(fp, t.replace(m.find, m.replace));
    } else {
      const obj = JSON.parse(before.toString('utf8'));
      for (const p of m.paths || [m.path]) {
        const [o, k] = walk(obj, p);
        if (m.op === 'set') o[k] = m.value; else if (m.op === 'add') o[k] = addDec(o[k], m.value); else if (m.op === 'delete') o.splice(Number(k), 1); else if (m.op === 'truncate') truncateAt(obj, o[k], m.value, m.coherent); else if (m.op === 'null') nullKeys(o[k], m.keys);
      }
      writeFileSync(fp, JSON.stringify(obj, null, 2) + (before.toString('utf8').endsWith('\n') ? '\n' : ''));
    }
    for (const a of m.also || []) {
      const ap = join(dir, a.file); const t = readFileSync(ap, 'utf8'); if (!t.includes(a.find)) throw new Error(`${m.id}: also-text not found in ${a.file}`);
      writeFileSync(ap, t.replace(a.find, a.replace));
    }
    if (m.repin) repinAll(dir, sha(before), sha(readFileSync(fp)));
    if (m.repinPackage) {   // the forgery follows the file's sha256 outside src/ too: the manifest pin and the two documents that quote it
      for (const f of ['RELEASE-MANIFEST.json', 'MANIFEST.md', 'README.md']) {
        const pp = join(dir, f); const pt = readFileSync(pp, 'utf8');
        if (!pt.includes(sha(before))) throw new Error(`${m.id}: the sha256 of ${m.file} is not in ${f}`);
        writeFileSync(pp, pt.split(sha(before)).join(sha(readFileSync(fp))));
      }
    }
    const regen = [].concat(m.regen || []);
    if (regen.includes('rtp-table')) {
      // the committed RTP table rewritten by the package's own script and re-pinned (src/rtp-settings.ts, src/artifact-pins.ts)
      const tf = join(dir, 'outputs', 'rtp-claim-table.json'); const old = sha(readFileSync(tf));
      const w = await run(dir, ['src/rtp-settings.ts']); if (w.code !== 0) throw new Error(`${m.id}: rtp-claim:write failed: ${w.out.slice(-300)}`);
      repinAll(dir, old, sha(readFileSync(tf)));
    }
    if (regen.includes('record')) {
      // a deleted step with the committed record regenerated and re-pinned (npm run record) and verify.js rebuilt after the
      // re-pin (npm run build:standalone) — the package's own workflow after a source edit — so -27 (record and bundle) cannot
      // be what catches it; only the verdict binding can: the run must print INCOMPLETE (exit 3)
      const rf = join(dir, 'outputs', 'verification-results.json'); const old = sha(readFileSync(rf));
      await run(dir, ['tests/verify.ts']);
      writeFileSync(rf, readFileSync(join(dir, 'outputs', 'run', 'verification-results.json')));
      repinAll(dir, old, sha(readFileSync(rf)));
      const built = await run(dir, ['scripts/build-standalone.mjs']); if (built.code !== 0) throw new Error(`${m.id}: build:standalone failed`);
    }
    if (regen.includes('simulate')) {
      const old = sha(readFileSync(join(dir, 'outputs', 'simulation-results.json')));
      const r = await new Promise((res) => { const c = spawn(process.execPath, [...NODE, 'src/simulate.ts'], { cwd: dir, env: { ...process.env, PF_EMIT: '1' } }); c.on('close', res); });
      if (r !== 0) throw new Error(`${m.id}: simulate failed`);
      repinAll(dir, old, sha(readFileSync(join(dir, 'outputs', 'simulation-results.json'))));
    }
    const { code, out } = await run(dir, ['tests/verify.ts']);
    const status = statusesOf(out)[m.kills] ?? 'MISSING';
    const baseline = BASE[m.kills] ?? 'MISSING';
    const verdict = (out.match(/VERDICT: (.+)/) || [])[1] || 'none';
    const verdictOk = !m.expectVerdict || verdict.startsWith(m.expectVerdict);
    const exitOk = m.expectExit === undefined || code === m.expectExit;
    return { id: m.id, kills: m.kills, what: m.what, baseline, status, killed: status !== 'MISSING' && baseline !== 'MISSING' && status !== baseline && verdictOk && exitOk, verdict, exit: code, ...(m.expectExit !== undefined ? { expectExit: m.expectExit } : {}) };
  } catch (e) { return { id: m.id, kills: m.kills, what: m.what, status: 'ERROR', killed: false, error: String(e.message) }; }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

const results = []; let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, list.length) }, async () => { while (next < list.length) { const m = list[next++]; const r = await one(m); results.push(r); console.log(`  ${r.id.padEnd(5)} ${r.kills}  ${r.killed ? 'KILLED' : 'SURVIVED'} (${r.baseline ?? '?'} -> ${r.status}; ${r.verdict ?? r.error}; exit ${r.exit ?? '-'}${r.expectExit !== undefined ? ` (expected ${r.expectExit})` : ''})  ${r.what}`); } }));
results.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
// every scored check (HARD_FAIL / FLAG) of the profile must have at least one killing mutation
// the scored list comes from the vendored framework profile, not from src/profile-map.ts
const scored = JSON.parse(readFileSync(join(ROOT, 'profile', 'profile.json'), 'utf8')).checks.filter((c) => c.policy === 'HARD_FAIL' || c.policy === 'FLAG').map((c) => c.id);
const uncoveredSteps = only.length ? [] : scored.filter((id) => !results.some((r) => r.kills === id && r.killed));
const out = { rule: 'killed = the named check ends with a status different from the unmutated copy, and the verdict and exit code the mutation expects (expectVerdict, expectExit) when it names them; a missing row or an error is a survivor', codeSha256: CODE, registry: reg.mutations.map((m) => m.id), node: process.versions.node, baseline: BASE, total: results.length, killed: results.filter((r) => r.killed).length, survivors: results.filter((r) => !r.killed).map((r) => ({ id: r.id, kills: r.kills, status: r.status, limitation: null })), uncoveredSteps, results };
mkdirSync(join(ROOT, 'outputs', 'run'), { recursive: true });
writeFileSync(join(ROOT, 'outputs', 'run', 'mutation-results.json'), JSON.stringify(out, null, 2) + '\n');
if (!only.length) writeFileSync(join(ROOT, 'outputs', 'mutation-results.json'), JSON.stringify(out, null, 2) + '\n');   // the committed record
console.log(`mutations: ${out.killed}/${out.total} killed; survivors ${out.survivors.length}; scored checks with no killing mutation: ${uncoveredSteps.join(', ') || 'none'}`);
process.exitCode = out.survivors.length || uncoveredSteps.length ? 1 : 0;
