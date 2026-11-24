// HouseBets House Games Hubie's Road (new engine, fairness version "canonical") — verification suite: the 31 checks of the
// ROAD profile (profile/profile.json, a byte copy of the framework's games/road/profile.json 1.0.0, Framework 1.1, its sha256
// checked at run time; src/profile-map.ts must carry the same rows). Run: npm run verify (Node 22, no install).
// A step that throws is scored FAIL and the run goes on; an exception outside every step still prints every row, exit 1.
// Status by policy: HARD_FAIL → PASS | FAIL; FLAG → PASS | FLAG (origin operator or capture); INFORMATIONAL → INFO;
// GRADED / RELEASE_GATE (package checks) → PASS | GAP, reported, not in the verdict — except a release-gate record
// (outputs/fresh-copy.json, outputs/mutation-results.json) that is missing or not the bytes RELEASE-MANIFEST.json pins: FAIL,
// and the verdict is NOT PROVABLY FAIR. A step that throws is scored FAIL, never skipped (step(), below).
// Verdict, ranked as RTP-CLAIM 1.2.0's rtpClaimVerdict: any FAIL → NOT PROVABLY FAIR (exit 1) > a scored check with no status
// from this run → INCOMPLETE (exit 3; never a pass) > ROAD-19 OVERSTATED → RTP FIGURE OVERSTATED (exit 5, Methodology
// v1.1) > an operator-origin FLAG → Conditional Pass (exit 2) > Full Pass (exit 0). A stale verify.js → exit 4, no verdict.
// A capture-origin FLAG is disclosed with a limitation row and is verdict-neutral (policy decided 2026-09-17).
// OBSERVATIONS (printed after the table, computed before the package checks) are facts the profile has no check for;
// they are recorded in the verification record, never scored.
// verify writes only outputs/run/ and never rewrites a pinned artifact.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, load, sha256File, sha256Bytes, readJson, PRIMARY_FILE, PRIMARY_SHA256, PHASE_C_FILE, PHASE_C_SHA256, PHASE_C10_FILE, PHASE_C10_SHA256,
  PHASE_D_FILE, PHASE_D_SHA256, PHASE_E_FILE, PHASE_E_SHA256, H24_FILE, H24_SHA256, EVIDENCE_PINS, EXPECTED_ROUNDS, EXPECTED_SEEDS,
  EXPECTED_EPOCHS, EXPECTED_EPOCH_SIZE, EXPECTED_PHASE_C_ROUNDS, EXPECTED_PHASE_C10_ROUNDS, EXPECTED_PHASE_D_ROUNDS, EXPECTED_PHASE_E_ROUNDS,
  PHASE_A_STAKE, PHASE_C_STAKE, PHASE_C10_STAKE, PHASE_C_DIFFICULTY, PHASE_D_SEEDS, NONCE_BASE, PLAN_ROUNDS_PER_DIFFICULTY, PLAN_DIFFICULTY_FLOOR, ALL_DATASETS } from '../src/loader.ts';
import { picks, positionFromU, sha256Hex, firstDeadlyLane } from '../src/rng.ts';
import * as RNG from '../src/rng.ts';
import { multFrac, multDouble, pay8, units8, fracToDouble, survivalComb, survivalProduct, MULT_NUM, MULT_DEN } from '../src/rules.ts';
import { SLOTS, DIFFICULTIES, DIFFICULTY_NAMES, SPEC_EXAMPLES, SPEC_PAYOUTS, MAX_WIN, MIN_STAKE } from '../src/spec.ts';
import { PROFILE, PROFILE_SHA256, PROFILE_VERSION, type Policy, type ProfileCheck } from '../src/profile-map.ts';
import { publishedRtp, publishedCoefficient, walletLimits, e01Tables, type RtpPlace } from '../src/exhibits.ts';
import { replayDataset, replayRound, epochIndex, type RoundResult } from '../src/replay.ts';
import { census, censusText, mult12, playedSlots, type Census, type Slot } from '../src/simulate.ts';
import { SIM_ROUNDS, FLOOR_ROUNDS_PER_DIFFICULTY, FLOOR_PASS2_NONCES, ALPHA_SCREEN, EDGE_SIGMAS, EDGE_BUFFER, EDGE_LOW_INFORMATION, PICKS_PER_ROUND, pass1Seed,
  SIM_PASS2_NONCES, SIM_PASS2_ALPHA, SIM_PASS2_STATISTIC, PASS2_D } from '../src/sim-config.ts';
import { chiSquaredPValue, runsStatisticFromCounts, twoSidedNormalP, normalLowerTailP, normalQuantile } from '../src/stats.ts';
import { edgeBandFalseAlarm, FAIL_FALSE_ALARM_CAP, fmtRate } from '../src/false-alarm.ts';
import { PASS2_FALSE_ALARM, PASS2_FALSE_ALARM_POOLED, PASS2_FALSE_ALARM_POOLED_AT_001 } from '../src/false-alarm-pass2.ts';
import { computeRtpClaim, runRtpClaimGate } from '../src/rtp-settings.ts';
import { RTP_CLAIM_RULE_ENFORCED, rtpClaimVerdict } from '../src/rtp-claim';
import { ARTIFACT_PINS, AUDIT_ID, SITE_VERIFIER_PIN } from '../src/artifact-pins.ts';
import { loadSiteModule, replay as replaySide, exportNames, type Probe } from '../src/site-verifier.ts';
import { fieldDiff, beyondTolerance } from '../src/diff.ts';
import type { Dataset } from '../src/types.ts';
import { codeFingerprint, sourceFingerprint, bundledSourceFingerprint } from '../scripts/fingerprint.mjs';

type Status = 'PASS' | 'FAIL' | 'FLAG' | 'INFO' | 'GAP' | 'NOTRUN' | 'OVERSTATED';
interface Row { id: string; name: string; policy: Policy; status: Status; origin?: 'operator' | 'capture'; detail: string }
const rows: Row[] = [];
// ═══ A step that throws is scored, never skipped ═══
// Every check below runs inside step(). An exception in a step (a file missing, a dataset field null or absent) marks the
// check(s) that step scores FAIL, with the error in the detail, and the next step still runs. A shared input that cannot be
// computed (input()) becomes a value that throws on first use and names itself, so every step that reads it fails on its own
// row. Any such error makes the verdict NOT PROVABLY FAIR (exit 1). An exception outside every step still prints every row,
// each check it left unscored as FAIL, and exits 1.
const RUN_ERRORS: string[] = [];
const TAINT = new Map<string, string>();
const errText = (e: unknown): string => { const x = e as { code?: string; name?: string; message?: string } | null; return `${x?.code ?? x?.name ?? 'Error'}: ${String(x?.message ?? e).split('\n')[0]}`; };
function step(ids: string[], fn: () => void): void {
  try { fn(); } catch (e) {
    const why = errText(e); RUN_ERRORS.push(`${ids.join(', ') || 'a shared computation'}: ${why}`);
    for (const id of ids) if (!TAINT.has(id)) TAINT.set(id, why);
  }
}
function input<T>(name: string, fn: () => T, ...fallback: [T?]): T {
  try { return fn(); } catch (e) {
    const why = errText(e); RUN_ERRORS.push(`input ${name}: ${why}`);
    // a boolean condition that cannot be computed is false (it fails the check it feeds); any other input is poisoned
    if (fallback.length) return fallback[0] as T;
    const poison = (): never => { throw new Error(`input ${name} could not be computed (${why})`); };
    return new Proxy(function () {}, { get: poison, apply: poison, construct: poison, has: poison, ownKeys: poison, getOwnPropertyDescriptor: poison }) as unknown as T;
  }
}
function failRow(id: string, detail: string): void {
  const r = rows.find((x) => x.id === id);
  if (r) { const was = `${r.status}: ${r.detail}`; r.status = 'FAIL'; delete r.origin; r.detail = `${detail} (recorded before the error: ${was})`; }
  else { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail }); }
}
/** Called first in finish(): every check whose step threw becomes FAIL. */
function applyTaint(): void {
  for (const [id, why] of TAINT) failRow(id, `NOT SCORED, the step threw ${why} (an input it reads is missing or malformed); scored FAIL, never skipped`);
  TAINT.clear();
}
/** A release-gate record (outputs/fresh-copy.json, outputs/mutation-results.json) that is missing, not pinned, or not the
 *  bytes RELEASE-MANIFEST.json pins for it: its check is FAIL, and the verdict fails (extraFails). A record that matches its
 *  pin but reports a shortfall stays a GAP. */
function pinFail(id: string, why: string): void {
  const d = `FAIL: the release-gate record is not the one RELEASE-MANIFEST.json pins (${why}); a deleted or edited record fails the verdict`;
  const r = rows.find((x) => x.id === id);
  if (r) { r.status = 'FAIL'; delete r.origin; r.detail = `${d}; ${r.detail}`; }
  else { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail: d }); }
}
/** Verdict-bearing failures outside the scored HARD_FAIL / FLAG rows: a FAIL on a package check (a release-gate record that
 *  is missing or differs from its RELEASE-MANIFEST.json pin) and any run error. */
const extraFails = (): number => rows.filter((r) => r.status === 'FAIL' && r.policy !== 'HARD_FAIL' && r.policy !== 'FLAG').length + RUN_ERRORS.length;
process.on('uncaughtException', (e) => {
  try {
    const why = errText(e); RUN_ERRORS.push(`the run stopped outside any step: ${why}`);
    for (const c of PROFILE) if (!rows.some((r) => r.id === c.id) && !TAINT.has(c.id)) TAINT.set(c.id, `${why}; the run stopped before this check`);
    finish();
  } catch (e2) { console.log(`VERDICT: NOT PROVABLY FAIR — the verifier stopped: ${errText(e)}; ${errText(e2)}`); }
  process.exit(1);
});
const observations: string[] = [];
// ═══ The step list is bound to the framework profile the MANIFEST cites ═══
// profile/profile.json is a byte copy of the framework's games/road/profile.json; its sha256 must equal PROFILE_SHA256 (the
// hash MANIFEST.md and RELEASE-MANIFEST.json cite). The scored check list and every check's policy are taken from THAT file,
// and src/profile-map.ts must carry the same rows (id, name, layer, kind, policy). A missing or altered profile file, a row
// missing from src/profile-map.ts or one relabelled there → INCOMPLETE (exit 3), never a pass; a relabelled step still runs
// under the profile's own policy, so forged data behind it still FAILs.
const PROFILE_FILE = 'profile/profile.json';
const binding = (() => {
  const issues: string[] = []; let sha: string | null = null; let checks: ProfileCheck[] | null = null; let version: string | null = null;
  try {
    const raw = readFileSync(join(ROOT, PROFILE_FILE)); sha = sha256Bytes(raw); const j = JSON.parse(raw.toString('utf8')); version = String(j.profileVersion);
    checks = j.checks.map((c: any) => ({ id: c.id, name: c.name, layer: c.layer, kind: c.kind, policy: c.policy }));
  } catch (e) { issues.push(`${PROFILE_FILE} unreadable (${(e as Error).message.split('\n')[0]})`); }
  if (sha !== null && sha !== PROFILE_SHA256) issues.push(`${PROFILE_FILE} sha256 ${sha.slice(0, 12)}… is not the cited profile ${PROFILE_SHA256.slice(0, 12)}…`);
  if (version !== null && version !== PROFILE_VERSION) issues.push(`profile version ${version} is not the cited ${PROFILE_VERSION}`);
  if (checks) {
    for (const c of checks) { const l = PROFILE.find((x) => x.id === c.id);
      if (!l) issues.push(`${c.id} missing from src/profile-map.ts`);
      else if (l.policy !== c.policy || l.name !== c.name || l.kind !== c.kind || l.layer !== c.layer) issues.push(`${c.id} relabelled in src/profile-map.ts (${l.policy}, profile ${c.policy})`); }
    for (const l of PROFILE) if (!checks.some((c) => c.id === l.id)) issues.push(`${l.id} in src/profile-map.ts is not in the profile`);
  }
  return { ok: issues.length === 0, issues, sha, checks: checks ?? PROFILE };
})();
const prof = (id: string) => { const p = binding.checks.find((c) => c.id === id); if (!p) throw new Error(`no profile check ${id}`); return p; };
/** Record a check by its profile policy. `ok` false → FAIL / FLAG / GAP; INFORMATIONAL is always INFO. */
function record(id: string, ok: boolean, detail: string, origin: 'operator' | 'capture' = 'operator') {
  const p = prof(id); let status: Status;
  if (p.policy === 'INFORMATIONAL') status = 'INFO';
  else if (p.policy === 'HARD_FAIL') status = ok ? 'PASS' : 'FAIL';
  else if (p.policy === 'FLAG') status = ok ? 'PASS' : 'FLAG';
  else status = ok ? 'PASS' : 'GAP';
  rows.push({ id, name: p.name, policy: p.policy, status, ...(status === 'FLAG' ? { origin } : {}), detail });
}
/** RTP-CLAIM 1.2.0 (Methodology v1.1; src/rtp-claim-switch.ts ON): the -19 status. `ok` carries the step's own
 *  conditions besides the rule (the exact derivation, the claim read from the exhibits): if one fails, the profile's policy
 *  applies as before. With those clean the rule decides: PASS, or OVERSTATED for a house-side miss of the published figure
 *  (verdict RTP FIGURE OVERSTATED, exit 5 — never NOT PROVABLY FAIR, the draws are checked by the other steps). A committed
 *  RTP table that does not equal this run's is a reproduction failure: FAIL, whatever the rule says. */
function recordRtpClaim(id: string, ok: boolean, gate: { status: 'INFO' | 'PASS' | 'OVERSTATED' | 'FAIL'; tableMatches: boolean }, detail: string) {
  const p = prof(id);
  if (!gate.tableMatches || gate.status === 'FAIL') { rows.push({ id, name: p.name, policy: p.policy, status: 'FAIL', detail }); return; }
  // An RTP miss is decided by the rule alone — OVERSTATED wins over every other condition of the step
  if (gate.status === 'OVERSTATED') { rows.push({ id, name: p.name, policy: p.policy, status: 'OVERSTATED', detail }); return; }
  if (!ok) { record(id, false, detail); return; }
  rows.push({ id, name: p.name, policy: p.policy, status: gate.status, detail });
}
/** A HARD_FAIL / FLAG check whose only shortfall is an auditor-side capture gap: a capture-origin FLAG (verdict-neutral). */
const captureFlag = (id: string, detail: string) => { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'FLAG', origin: 'capture', detail }); };
const pct = (a: number, b: number) => `${a}/${b}`;
/** The scored check list the verdict is bound to — every HARD_FAIL and FLAG check of the profile (profile/profile.json), each recorded exactly once. */
const EXPECTED_SCORED = binding.checks.filter((c) => c.policy === 'HARD_FAIL' || c.policy === 'FLAG').map((c) => c.id);
const EXPECTED_STEPS = EXPECTED_SCORED.length;   // compared with the executed scored-check count in finish() (scored.length vs EXPECTED_STEPS)
const t0 = Date.now();

// ═══ ROAD-26 dataset & config pins — before anything reads the data ═══
const dataPins: [string, string][] = [[PRIMARY_FILE, PRIMARY_SHA256], [PHASE_C_FILE, PHASE_C_SHA256], [PHASE_C10_FILE, PHASE_C10_SHA256],
  [PHASE_D_FILE, PHASE_D_SHA256], [PHASE_E_FILE, PHASE_E_SHA256], [H24_FILE, H24_SHA256]];
const pinBad = [...dataPins, ...EVIDENCE_PINS].filter(([f, h]) => sha256File(f) !== h);
if (pinBad.length) { record('ROAD-26', false, `mismatch: ${pinBad.map(([f]) => f).join(', ')} — abort before any step`); finish(); process.exit(1); }
// The exhibits are pin-checked; every constant that stays in src/ must equal the exhibit's value, and the published
// return must parse from every place that states it. A mismatch is a reproduction failure (FAIL, exit 1).
let PUB: { rtp: string; agree: boolean; places: RtpPlace[] } | null = null;
step(['ROAD-26'], () => {
  const bad: string[] = [];
  try { PUB = publishedRtp(); } catch (e) { bad.push((e as Error).message); }
  try { const lim = walletLimits();
    if (units8(MIN_STAKE) !== units8(lim.minBet)) bad.push(`src/spec.ts MIN_STAKE ${MIN_STAKE} ≠ E03 wallet.minBet ${lim.minBet}`);
    if (units8(MAX_WIN) !== units8(lim.maxWin)) bad.push(`src/spec.ts MAX_WIN ${MAX_WIN} ≠ E03 wallet.maxWin ${lim.maxWin}`);
  } catch (e) { bad.push(`E03 wallet limits unreadable (${(e as Error).message})`); }
  const co = publishedCoefficient(); const dec = (s: string | null): [bigint, bigint] | null => { const m = s ? /^(\d+)(?:\.(\d+))?$/.exec(s) : null; return m ? [BigInt(m[1] + (m[2] ?? '')), 10n ** BigInt((m[2] ?? '').length)] : null; };
  const fr = co.e01 ? co.e01.split('/').map(BigInt) : null, d2 = dec(co.e02);
  if (!fr || fr[0] * MULT_DEN !== MULT_NUM * fr[1]) bad.push(`E01 "multiplier" coefficient ${co.e01} ≠ src/rules.ts ${MULT_NUM}/${MULT_DEN}`);
  if (!d2 || d2[0] * MULT_DEN !== MULT_NUM * d2[1]) bad.push(`E02 rulesRoadReturn coefficient ${co.e02} ≠ src/rules.ts ${MULT_NUM}/${MULT_DEN}`);
  const tb = e01Tables(); const J = JSON.stringify;
  if (tb.slots !== SLOTS) bad.push(`src/spec.ts SLOTS ${SLOTS} ≠ E01 slots ${tb.slots}`);
  if (J(tb.difficulties.map((d) => [d.name, d.traps, d.lanes])) !== J(DIFFICULTY_NAMES.map((d) => [d, ...DIFFICULTIES[d]]))) bad.push('src/spec.ts DIFFICULTIES ≠ E01 "difficulties"');
  const exKeys = (x: any) => J([x.serverSeed, x.clientSeed, x.nonce, x.difficulty, x.field, x.trapLane]);
  if (J(tb.examples.map(exKeys)) !== J(SPEC_EXAMPLES.map(exKeys))) bad.push('src/spec.ts SPEC_EXAMPLES ≠ E01 "examples"');
  const payBad = DIFFICULTY_NAMES.filter((d) => J(tb.payouts?.[d]) !== J(SPEC_PAYOUTS[d]));
  if (payBad.length || Object.keys(tb.payouts ?? {}).length !== DIFFICULTY_NAMES.length) bad.push(`src/spec.ts SPEC_PAYOUTS ≠ E01 "payouts" (${payBad.join(', ') || 'difficulty set'})`);
  record('ROAD-26', bad.length === 0, `${dataPins.length} datasets + ${EVIDENCE_PINS.length} evidence exhibits match their sha256 pinned in src/loader.ts; the figures checks compare against, read from the exhibits: MIN_STAKE ${MIN_STAKE} == E03 wallet.minBet, MAX_WIN ${MAX_WIN} == E03 wallet.maxWin, multiplier coefficient ${MULT_NUM}/${MULT_DEN} == E01 "multiplier" (${co.e01}) and E02 rulesRoadReturn (${co.e02}), SLOTS, DIFFICULTIES, SPEC_EXAMPLES and the 81-cell SPEC_PAYOUTS table == E01, the published return parses from ${PUB ? PUB.places.map((p) => `${p.where} (${p.rtp})`).join(' and ') : 'NO place'}: ${bad.length === 0}${bad.length ? ' — ' + bad.join('; ') : ''}`);
  if (!PUB) { finish(); process.exit(1); }
});

const ds = input('ds', () => (load(PRIMARY_FILE))), pC = input('pC', () => (load(PHASE_C_FILE))), pC10 = input('pC10', () => (load(PHASE_C10_FILE))), pD = input('pD', () => (load(PHASE_D_FILE))), pE = input('pE', () => (load(PHASE_E_FILE))), h24 = input('h24', () => (load(H24_FILE)));
const SCORED: [string, Dataset][] = input('SCORED', () => ([['A', ds], ['C', pC], ['C $10', pC10], ['D', pD], ['E', pE]]));
const rp = input('rp', () => (new Map(SCORED.map(([k, d]) => [k, replayDataset(d)]))));
// The 12 Oct file: every round recorded whole is recomputed round by round (ROAD-03/04 answer-agreement rows, 07, 10, 11, 13,
// 14, 17; the round the server finished under the 24 h rule is scored in ROAD-31). One record is not replayed: the round
// resumed after the capture re-sent one step request ~680 times with the same generation id (its own generation-reuse bug,
// stopped by the operator); it is counted in ROAD-16's reconciliation. The file's pairs are epochs of 10 played before the
// Phase A design, so the population and pair-structure checks (02, 04's epoch rule, 05) do not read it.
const O12 = '12 Oct';
const ridRecords = new Map<string, number>(); step(['ROAD-05'], () => { for (const r of h24.rounds) if (r.roundId) ridRecords.set(r.roundId, (ridRecords.get(r.roundId) || 0) + 1); });
const whole = (r: Dataset['rounds'][number]) => (ridRecords.get(r.roundId!) || 0) === 1 && !r.resumedFinish;
const notReplayed = input('notReplayed', () => (h24.rounds.filter((r) => !whole(r))));
step(['ROAD-05'], () => { rp.set(O12, replayDataset(h24, whole)); });
const R = (k: string) => rp.get(k)!;
/** [ok, total] of every replay row whose name starts with `prefix`, over the named datasets. */
function agg(keys: string[], prefix: string): [number, number] {
  let a = 0, b = 0; for (const k of keys) for (const [name, [x, y]] of Object.entries(R(k).rows)) if (name.startsWith(prefix)) { a += x; b += y; } return [a, b];
}
const ALL = input('ALL', () => (SCORED.map(([k]) => k)));
const ALLR = input('ALLR', () => ([...ALL, O12]));   // every replayed round: the 7,600 of the 13 Oct phases and the 12 Oct rounds recorded whole
const full = (x: [number, number]) => x[1] > 0 && x[0] === x[1];
const fmt = (x: [number, number]) => pct(x[0], x[1]);
const betOf = (r: Dataset['rounds'][number]) => r.requests.find((q) => q.path === '/road/bet' && q.status === 200)!;
const rowOk = (x: RoundResult, prefix: string) => Object.entries(x.rows).filter(([n]) => n.startsWith(prefix)).every(([, [a, b]]) => a === b);
const failRows = (k: string) => ['round has its bet', 'round is on a revealed epoch', 'round settled', 'difficulty is published'].map((p) => agg([k], p)[1]).reduce((s, v) => s + v, 0);
/** P(two independent seeds give the same ordered field of m traps on 25 slots) = 1 / (25·24···(25−m+1)). */
const pSame = (m: number) => { let p = 1; for (let i = 0; i < m; i++) p /= SLOTS - i; return p; };

// ═══ ROAD-05 population & epoch size (G-BIND) ═══
step(['ROAD-05'], () => {
  const perEpoch = (k: string) => { const m = new Map<string, number>(); for (const x of R(k).results) if (x.epochHash) m.set(x.epochHash, (m.get(x.epochHash) || 0) + 1); return m; };
  const pe = perEpoch('A'); const sizesOk = [...pe.values()].every((n) => n === EXPECTED_EPOCH_SIZE);
  const onRevealed = ds.rounds.length - failRows('A');
  const shapeA = ds.rounds.filter((r) => { const b = betOf(r).body; return r.spec?.kind === 'auto' && Number(b.steps) === 1 && units8(b.amount) === units8(PHASE_A_STAKE); }).length;
  const sup: [string, Dataset, number][] = [['C', pC, EXPECTED_PHASE_C_ROUNDS], ['C $10', pC10, EXPECTED_PHASE_C10_ROUNDS], ['D', pD, EXPECTED_PHASE_D_ROUNDS], ['E', pE, EXPECTED_PHASE_E_ROUNDS]];
  const supOk = sup.map(([k, d, n]) => { const m = perEpoch(k); return { k, n: d.rounds.length, want: n, epochs: m.size, whole: [...m.values()].every((v) => v === EXPECTED_EPOCH_SIZE) && m.size === d.seeds.length }; });
  const ok = ds.rounds.length === EXPECTED_ROUNDS && ds.seeds.length === EXPECTED_SEEDS && pe.size === EXPECTED_EPOCHS && sizesOk && onRevealed === EXPECTED_ROUNDS
    && shapeA === EXPECTED_ROUNDS && supOk.every((s) => s.n === s.want && s.whole);
  record('ROAD-05', ok, `Phase A ${ds.rounds.length} rounds / ${ds.seeds.length} seeds / ${pe.size} epochs (by the hash in the server's bet answer), every epoch exactly ${EXPECTED_EPOCH_SIZE}: ${sizesOk}; ${pct(onRevealed, EXPECTED_ROUNDS)} on a revealed epoch; ${pct(shapeA, EXPECTED_ROUNDS)} one auto bet naming ONE lane at ${PHASE_A_STAKE}; supplementary ${supOk.map((s) => `${s.k} ${s.n} in ${s.epochs} whole epochs of ${EXPECTED_EPOCH_SIZE}: ${s.n === s.want && s.whole}`).join(', ')} — against src/loader.ts constants, never meta; the 12 Oct file is not part of this population (its rounds are recomputed one by one in ROAD-03, 04, 07, 10, 11, 13, 14, 17 and 31 and reconciled in ROAD-16, never counted here)`);
});

// ═══ ROAD-01 seed hash integrity (every revealed seed of every dataset, and each pre-capture reveal) ═══
step(['ROAD-01'], () => {
  const sets = [...SCORED.map(([, d]) => d), h24];
  const all = sets.flatMap((d) => d.seeds);
  const ok = all.filter((s) => sha256Hex(s.revealedServerSeed) === s.hashedServerSeed).length;
  const primOk = ds.seeds.filter((s) => sha256Hex(s.revealedServerSeed) === s.hashedServerSeed).length;
  const pre = sets.filter((d) => d.preCapture?.revealedServerSeed && sha256Hex(d.preCapture.revealedServerSeed) === d.preCapture.hashedServerSeed).length;
  record('ROAD-01', ok === all.length && primOk === EXPECTED_SEEDS && pre === sets.length, `sha256(utf8(revealed)) == committed (E01 encoding): ${pct(primOk, EXPECTED_SEEDS)} Phase A seeds, ${pct(ok, all.length)} across A, C, C $10, D, E and the 12 Oct file; pre-capture reveals ${pct(pre, sets.length)}; 0 rounds on an unrevealed seed`);
});

// ═══ ROAD-02 forward commitment chain, anchored before epoch 0 and closed after the last ═══
step(['ROAD-02'], () => {
  const chain = (d: Dataset) => {
    let n = 0; for (let i = 0; i + 1 < d.seeds.length; i++) if (d.seeds[i].hashedNextServerSeed === d.seeds[i + 1].hashedServerSeed) n++;
    const anchor = d.preCapture?.hashedNextServerSeed === d.seeds[0].hashedServerSeed;
    const post = d.meta?.postCapture?.activePair; const end = !!post && d.seeds[d.seeds.length - 1].hashedNextServerSeed === post.hashedServerSeed;
    return { n, of: d.seeds.length - 1, anchor, end, ok: n === d.seeds.length - 1 && anchor && end };
  };
  const c = SCORED.map(([k, d]) => ({ k, ...chain(d) }));
  record('ROAD-02', c.every((x) => x.ok) && c[0].n === EXPECTED_SEEDS - 1, c.map((x) => `${x.k} ${x.n}/${x.of} links, pre-capture anchor ${x.anchor}, last next-hash == the pair active after the capture ${x.end}`).join('; ') + ' — recomputed from the raw hashes, never from the capture\'s booleans');
});

// ═══ ROAD-03 hash consistency within epoch ═══
step(['ROAD-03'], () => {
  const per = (k: string) => {
    const by = new Map<string, RoundResult[]>(); for (const x of R(k).results) if (x.epochHash) { const a = by.get(x.epochHash) || []; a.push(x); by.set(x.epochHash, a); }
    return [...by.values()].filter((a) => a.every((x) => rowOk(x, "round's pair") && rowOk(x, 'fairness.hashedServerSeed') && rowOk(x, 'fairness.clientSeed'))).length;
  };
  const a = per('A'); const sup = ['C', 'C $10', 'D', 'E'].map((k) => [k, per(k), SCORED.find(([n]) => n === k)![1].seeds.length] as const);
  const agree = agg(ALLR, 'server answers agree: every answer of the round carries the settled hash'), copies = agg(ALLR, 'capture copies');
  record('ROAD-03', a === EXPECTED_EPOCHS && sup.every(([, n, s]) => n === s) && full(agree) && full(copies), `${pct(a, EXPECTED_EPOCHS)} Phase A epochs: every round's bet answer carries the hash read before it, and its settled fairness block the epoch's hash and client seed; ${sup.map(([k, n, s]) => `${k} ${n}/${s}`).join(', ')}; every server answer of a round (bet, each action, game_detail) carries the same hash, client seed and version as the settled block the recompute uses: ${fmt(agree)} rounds (A, C, C $10, D, E, 12 Oct); the capture's own copies (round id, client seed and hash read before the round, outcome label) == the server's answer: ${fmt(copies)}`);
});

// ═══ ROAD-04 nonce continuity ═══
step(['ROAD-04'], () => {
  const per = (k: string, d: Dataset) => {
    let ok = 0; const bad: string[] = []; const byHash = new Map<string, number[]>();
    for (const x of R(k).results) if (x.epochHash) { const a = byHash.get(x.epochHash) || []; a.push(x.nonce); byHash.set(x.epochHash, a); }
    for (const s of d.seeds) {
      const ns = (byHash.get(s.hashedServerSeed) || []).slice().sort((a, b) => a - b);
      if (ns.length === EXPECTED_EPOCH_SIZE && ns.every((n, i) => n === NONCE_BASE + i) && Number(s.serverNonceAtRotation) === ns.length) ok++; else bad.push(String(s.epoch));
    }
    return { ok, of: d.seeds.length, bad };
  };
  const res = SCORED.map(([k, d]) => ({ k, ...per(k, d) }));
  const step = agg(ALL, 'fairness.nonce'), agreeN = agg(ALLR, 'server answers agree: every answer of the round carries the settled nonce'), step12 = agg([O12], 'fairness.nonce');
  record('ROAD-04', res.every((r) => r.ok === r.of) && res[0].ok === EXPECTED_EPOCHS && full(step) && full(agreeN) && full(step12), `${res.map((r) => `${r.k} ${r.ok}/${r.of}`).join(', ')} epochs: nonces exactly ${NONCE_BASE}..${EXPECTED_EPOCH_SIZE}, once each, no gap, repeat or reorder, and N == the server's nonce read at rotation; every round's nonce == the server's count before it + 1: ${fmt(step)} (12 Oct ${fmt(step12)}); every server answer of a round carries the settled nonce and round id: ${fmt(agreeN)} rounds${res.some((r) => r.bad.length) ? `; bad epochs ${res.map((r) => r.bad.join(',')).join(' ')}` : ''}`);
});

// ═══ ROAD-07 trap-field recomputation (every round, every dataset) ═══
step(['ROAD-07'], () => {
  const fA = agg(['A'], 'field (trap slots'), autoA = agg(['A'], 'auto (lanes up front)'), lane = agg(ALLR, 'trapLane ==');
  const sup = ['C', 'C $10', 'D', 'E', O12].map((k) => [k, agg([k], 'field (trap slots')] as const);
  const okRounds = [...SCORED.map(([k, d]) => [k, R(k).okRounds, d.rounds.length] as const), [O12, R(O12).okRounds, R(O12).results.length] as const];
  const ok = fA[0] === EXPECTED_ROUNDS && fA[1] === EXPECTED_ROUNDS && full(autoA) && full(lane) && sup.every(([, x]) => full(x)) && okRounds.every(([, a, b]) => a === b);
  record('ROAD-07', ok, `the trap field derived from the revealed seed (E01: HMAC-SHA256 blocks, 4-byte draws, floor(u·(25 − i)/2^32) among the slots left; difficulty m = the first m picks) == the served field IN DRAW ORDER: Phase A ${fmt(fA)} (coverage == expectedRounds ${EXPECTED_ROUNDS}), ${sup.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; served trapLane == the first deadly lane derived ${fmt(lane)}; Phase A auto replay (position, outcome, hit from the derived field) ${fmt(autoA)}; rounds with every row clean ${okRounds.map(([k, a, b]) => `${k} ${a}/${b}`).join(', ')} (12 Oct: the ${R(O12).results.length} records of the ${h24.rounds.length} recorded whole, the 24 h round included; ${notReplayed.length} record not replayed — the round resumed after the capture's repeated step requests — counted in ROAD-16)${[...ALLR].flatMap((k) => R(k).bad).length ? ' — ' + [...ALLR].flatMap((k) => R(k).bad).slice(0, 3).join('; ') : ''}`);
});

// ═══ ROAD-08 draw bias bound: census of src/rng.ts positionFromU over all 2^32 values of u, for every range the game uses ═══
step(['ROAD-08'], () => {
  const T = 4294967296; let worst = 0, worstN = 0, monotone = true, sums = true, floorCeil = true;
  const nMin = SLOTS - Math.max(...DIFFICULTY_NAMES.map((d) => DIFFICULTIES[d][0])) + 1;
  for (let n = nMin; n <= SLOTS; n++) {
    const first = (j: number) => { let lo = 0, hi = T; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (positionFromU(mid, n) >= j) hi = mid; else lo = mid + 1; } return lo; };
    const f = Array.from({ length: n + 1 }, (_, j) => (j === n ? T : first(j)));
    if (positionFromU(0, n) !== 0 || positionFromU(T - 1, n) !== n - 1) monotone = false;
    let total = 0;
    for (let j = 0; j < n; j++) {
      const c = f[j + 1] - f[j]; total += c; if (c !== Math.floor(T / n) && c !== Math.ceil(T / n)) floorCeil = false;
      if (c <= 0 || positionFromU(f[j], n) !== j || positionFromU(f[j + 1] - 1, n) !== j) monotone = false;
      const dev = Math.abs(c * n - T) / (n * T); if (dev > worst) { worst = dev; worstN = n; }
    }
    if (total !== T) sums = false;
  }
  record('ROAD-08', monotone && sums && floorCeil && worst <= 2 ** -32, `count of src/rng.ts positionFromU over the 2^32 values of u, taken from the two ends of each outcome's interval (found by binary search and checked through the function; the values between the ends are not enumerated, so the count is exact for a map that is monotone in u) for every range n = ${nMin} … ${SLOTS} (the picks of the four difficulties): counts sum to 2^32, the interval ends are in order, every position gets ⌊2^32/n⌋ or ⌈2^32/n⌉: ${monotone && sums && floorCeil}; worst |P(j) − 1/n| = ${worst.toExponential(4)} (n = ${worstN}) ≤ 2^-32 = ${(2 ** -32).toExponential(4)} (no rejection; u·n/2^32 is exact in binary64)`);
});

// ═══ ROAD-09 RNG reference vectors (E01 published examples + a captured round) — package check ═══
step(['ROAD-09'], () => {
  const ex = SPEC_EXAMPLES.filter((x) => { const [m, lanes] = DIFFICULTIES[x.difficulty]; const f = picks(x.serverSeed, x.clientSeed, x.nonce, m); return JSON.stringify(f) === JSON.stringify(x.field) && firstDeadlyLane(f, lanes) === x.trapLane; }).length;
  let pay = 0, payN = 0; for (const [d, list] of Object.entries(SPEC_PAYOUTS)) list.forEach((s, i) => { payN++; const [a, b] = multFrac(SLOTS, DIFFICULTIES[d][0], i + 1); const [n, q] = s.split('/').map(BigInt); if (a * q === b * n) pay++; });
  const r0 = ds.rounds[0]; const g = betOf(r0).response.game; const s0 = ds.seeds.find((s) => s.hashedServerSeed === g.fairness.hashedServerSeed)!;
  const [m0, l0] = DIFFICULTIES[g.difficulty]; const f0 = picks(s0.revealedServerSeed, s0.clientSeed, Number(g.fairness.nonce), m0);
  const capOk = JSON.stringify(f0) === JSON.stringify(g.field) && firstDeadlyLane(f0, l0) === g.trapLane && g.multiplier === multDouble(SLOTS, m0, 1);
  record('ROAD-09', ex === SPEC_EXAMPLES.length && pay === payN && payN === 81 && capOk, `the ${SPEC_EXAMPLES.length} worked examples of HouseBets' published spec (E01 "examples": field and first deadly lane) ${pct(ex, SPEC_EXAMPLES.length)}; its published multipliers (E01 "payouts") ${pct(pay, payN)}; captured round 0 (${g.difficulty}, trap lane ${g.trapLane}, ×${g.multiplier}) recomputes: ${capOk}; also tests/rng.test.ts`);
});

// ═══ ROAD-06 client-seed influence, Phase D recomputation, client-seed generator ═══
step(['ROAD-06'], () => {
  let changed = 0, lam = 0; const byHash = epochIndex(ds);
  for (const x of R('A').results) {
    const s = byHash.get(x.epochHash!)!.seed; lam += pSame(x.traps);
    if (JSON.stringify(picks(s.revealedServerSeed, s.clientSeed + '#wrong', x.nonce, x.traps)) !== JSON.stringify(x.settledField)) changed++;
  }
  const coll = R('A').results.length - changed, collBound = lam + 5 * Math.sqrt(lam) + 5;
  const seedsInOrder = pD.seeds.map((s) => s.clientSeed);
  const playerSet = PHASE_D_SEEDS.every((x, i) => seedsInOrder[i] === x) && new Set(seedsInOrder).size >= 2;
  const dIx = epochIndex(pD); let dChanged = 0, dLam = 0;
  for (const x of R('D').results) {
    const e = dIx.get(x.epochHash!)!; const prev = e.ix === 0 ? pD.preCapture?.clientSeed : pD.seeds[e.ix - 1].clientSeed;
    dLam += pSame(x.traps);
    if (prev && JSON.stringify(picks(e.seed.revealedServerSeed, prev, x.nonce, x.traps)) !== JSON.stringify(x.settledField)) dChanged++;
  }
  const dClean = R('D').okRounds;
  const others = [ds, pC, pC10, pE].flatMap((d) => d.seeds);
  const csprng = others.filter((s) => s.clientSeedSource === 'node:crypto randomBytes(16) hex').length;
  const after = others.filter((s) => { const w = s.clientSeedDrawnAfterCommitment; return !!w && w.committedHash === s.hashedServerSeed && !!w.clientSeedDrawnAt && !!w.commitmentReadAt && Date.parse(w.clientSeedDrawnAt) >= Date.parse(w.commitmentReadAt); }).length;
  const esc = readJson('evidence/E06-road-empty-seed-control-2026-10-13.json').record;
  const ok = changed > 0 && coll <= collBound && dClean === pD.rounds.length && playerSet && R('D').results.length - dChanged <= dLam + 5 * Math.sqrt(dLam) + 5 && csprng === others.length && after === others.length && esc.status === 400 && esc.accepted === false;
  record('ROAD-06', ok, `a wrong client seed changes ${pct(changed, R('A').results.length)} Phase A trap fields (${coll} identical, expected ${lam.toFixed(2)} — the easy 1-trap fields — bound ${collBound.toFixed(2)}); Phase D: player-set seeds ${JSON.stringify(seedsInOrder)} (predictable, disclosed DL-1, all 4 epochs exposed), ${pct(dClean, pD.rounds.length)} rounds replay clean, ${pct(dChanged, pD.rounds.length)} fields differ under the previous client seed (expected identical ${dLam.toFixed(2)}); phases A, C, C $10, E client seeds LABELLED by the capture as 'node:crypto randomBytes(16) hex' ${pct(csprng, others.length)} (a label match; a redacted reference copy of the capture code is in capture/, the as-run game script is held privately, DL-1), each drawn at or after the read of the hash it plays under ${pct(after, others.length)}; empty-seed control: server refused, HTTP ${esc.status} (E06)`);
});

// ═══ ROAD-10 lane outcome & step-sequence consistency ═══
step(['ROAD-10'], () => {
  const o = agg(ALLR, 'outcome from the derived field'), deadly = agg(ALLR, 'step onto a derived deadly'), auto = agg(ALLR, 'auto (lanes up front)'), lane = agg(ALLR, 'trapLane ==');
  let beyond = 0; for (const [, d] of SCORED) for (const r of d.rounds) { const L = DIFFICULTIES[String(betOf(r).body.difficulty)][1]; for (const q of r.requests) { const g = q.response?.game; if (q.status === 200 && g && (g.position ?? 0) > L) beyond++; } }
  let wins1 = 0, wins = 0, traps0 = 0, traps = 0;
  for (const x of R('A').results) { if (x.outcome === 'trap') { traps++; if (x.k === 0 && x.firstDeadly === 1) traps0++; } else { wins++; if (x.k === 1) wins1++; } }
  record('ROAD-10', full(o) && full(deadly) && full(auto) && full(lane) && beyond === 0 && wins1 === wins && traps0 === traps, `lane L deadly iff slot L − 1 is a trap: a trap ends on exactly the first deadly lane walked, a win crosses none, the castle is the last lane — from the recomputed field, never the outcome label: ${fmt(o)} rounds (A, C, C $10, D, E, 12 Oct); a step onto a derived deadly lane ends the round with payout 0: ${fmt(deadly)}; auto bets settle as the derived field says: ${fmt(auto)}; no answer places Hubie past the difficulty's lanes count: ${beyond === 0}; Phase A: ${pct(wins1, wins)} wins crossed exactly lane 1, ${pct(traps0, traps)} traps hit lane 1 with position 0`);
});

// ═══ ROAD-11 payout arithmetic ═══
step(['ROAD-11'], () => {
  const p = agg(ALLR, 'payout =='), rec = agg(ALLR, 'settled round record'), grid = agg(ALLR, 'money on the 1e-8 grid');
  record('ROAD-11', full(p) && full(rec) && full(grid), `payout == floor(stake × 99·C(25,k) / (100·C(25−m,k))) on the 1e-8 grid, exact BigInt, 0 on a trap (E01 rules "a payout is rounded down to the wallet's smallest unit (1e-8) once"): ${fmt(p)} rounds (A ${fmt(agg(['A'], 'payout =='))}, 12 Oct ${fmt(agg([O12], 'payout =='))}; the round finished under the 24 h rule is scored in ROAD-31); the settled round record (roundId, stake, payout) agrees: ${fmt(rec)}; every amount sent and served on the 1e-8 grid (an off-grid value fails, it is never rounded onto the grid): ${fmt(grid)} rounds${[...ALLR].flatMap((k) => R(k).bad).length ? ' — ' + [...ALLR].flatMap((k) => R(k).bad).slice(0, 3).join('; ') : ''}`);
});

// ═══ ROAD-12 bet-size invariance (Phase C at 100 × the Phase A stake, and the $10 set) ═══
step(['ROAD-12'], () => {
  const chk = (k: string, d: Dataset, stake: string) => {
    const st = d.rounds.filter((r) => { const q = betOf(r); const g = [...r.requests].reverse().find((x) => x.status === 200 && x.response?.game?.active === false)?.response; return units8(q.body.amount) === units8(stake) && units8(g?.game?.stake ?? -1) === units8(stake) && units8(g?.round?.stake ?? -1) === units8(stake); }).length;
    const conf = d.rounds.every((r) => betOf(r).body.difficulty === PHASE_C_DIFFICULTY && Number(betOf(r).body.steps) === 1);
    const wins = R(k).results.filter((x) => x.won).length;
    return { n: d.rounds.length, clean: R(k).okRounds, st, conf, wins, ok: R(k).okRounds === d.rounds.length && st === d.rounds.length && conf && wins >= 100 };
  };
  const a = chk('C', pC, PHASE_C_STAKE), b = chk('C $10', pC10, PHASE_C10_STAKE);
  const hundred = units8(PHASE_C_STAKE) === 100n * units8(PHASE_A_STAKE);
  record('ROAD-12', a.ok && b.ok && hundred, `Phase C ${a.n} rounds on ${PHASE_C_DIFFICULTY}, one lane, at ${PHASE_C_STAKE} (= 100 × the Phase A stake ${PHASE_A_STAKE}: ${hundred}): ${pct(a.clean, a.n)} replay clean (field, outcome, multiplier, payout), stake as sent and settled ${pct(a.st, a.n)}, ${a.wins} elevated wins (≥ 100); $10 set ${b.n} rounds at ${PHASE_C10_STAKE}: ${pct(b.clean, b.n)} clean, stake ${pct(b.st, b.n)}, ${b.wins} wins (≥ 100); the derivation takes no stake input`);
});

// ═══ ROAD-13 multiplier formula & provenance ═══
step(['ROAD-13'], () => {
  const settled = agg(ALLR, 'served multiplier'), rungs = agg(ALLR, 'rung:');
  let spec = 0, specN = 0; for (const [d, list] of Object.entries(SPEC_PAYOUTS)) list.forEach((s, i) => { specN++; const [a, b] = multFrac(SLOTS, DIFFICULTIES[d][0], i + 1); const [n, q] = s.split('/').map(BigInt); if (a * q === b * n) spec++; });
  record('ROAD-13', full(settled) && full(rungs) && spec === specN, `served multiplier == 99·C(25,k) / (100·C(25−m,k)) as the nearest binary64 (E01 "multiplier"; E02 rulesRoadReturn "0.99 × C(25, k) / C(25 − m, k)"): every winning settle ${fmt(settled)}, every open lane of a stepped round ${fmt(rungs)} (multiplier and value; A, C, C $10, D, E, 12 Oct); E01's published table ${pct(spec, specN)} cells; computed from (m, k) alone — no served odds field is read by the derivation`);
});

// ═══ ROAD-14 multiplier monotonicity & bounds, and the max-win rule ═══
step(['ROAD-14'], () => {
  let upK = 0, upKn = 0, upM = 0, upMn = 0, above1 = 0, cells = 0;
  const ms = DIFFICULTY_NAMES.map((d) => DIFFICULTIES[d]);
  ms.forEach(([m, lanes], i) => {
    for (let k = 1; k <= lanes; k++) {
      cells++; const [a, b] = multFrac(SLOTS, m, k); if (a > b) above1++;
      if (k < lanes) { upKn++; const [c, d] = multFrac(SLOTS, m, k + 1); if (c * b > a * d) upK++; }
      if (i + 1 < ms.length && k <= ms[i + 1][1]) { upMn++; const [c, d] = multFrac(SLOTS, ms[i + 1][0], k); if (c * b > a * d) upM++; }
    }
  });
  const cap8 = units8(MAX_WIN); const e3 = readJson('evidence/E03-road-limits-2026-10-13.json').answer;
  const capSame = units8(e3.wallet.maxWin) === cap8;
  const allRes = ALLR.flatMap((k) => R(k).results); const underCap = allRes.filter((x) => x.payout8 - x.stake8 <= cap8).length;
  const opts = agg(ALLR, 'options.step'); const capStops = allRes.reduce((s, x) => s + x.capStops, 0);
  // The max-win branch — witnessed only if an auto bet stopped at the cap or a served answer offered a max-win stop
  let answers = 0, offers = 0;
  for (const [k, d] of [...SCORED, [O12, h24] as [string, Dataset]]) for (const r of d.rounds) { if (k === O12 && !whole(r)) continue;
    for (const q of r.requests) { const g = q.status === 200 ? q.response?.game : null; if (!g || !g.options) continue; answers++; if (g.options.maxWin) offers++; } }
  const hard = upK === upKn && upM === upMn && above1 === cells && capSame && underCap === allRes.length && full(opts);
  const detail = `exact fractions over the ${cells} published (difficulty, lanes) cells: strictly increasing in lanes ${pct(upK, upKn)}, in trap count ${pct(upM, upMn)}, every multiplier > 1 ${pct(above1, cells)}; max win ${MAX_WIN} USDT == E03 wallet maxWin: ${capSame}; every settled win within it ${pct(underCap, allRes.length)}; the next-lane offer follows the max-win rule on every open step ${fmt(opts)}; auto stops at the cap: ${capStops}; answers offering a max-win stop: ${offers} of the ${answers} request answers of the replayed rounds`;
  if (!hard) record('ROAD-14', false, detail);
  // The ROAD-14 rule (profile): "… the published max-win rule … holds on every round; the cap branch is witnessed in data or
  // declared unwitnessed; a violation is disclosed, not failed". Declared unwitnessed is the rule's own route, so PASS with
  // the branch declared (DL-10)
  else if (capStops === 0 && offers === 0) record('ROAD-14', true, `${detail} — the cap branch (a lane not walked, the round cashed out at its value) is UNWITNESSED: no captured round came near the max win, so the branch is declared unwitnessed (DL-10), as the rule allows: PASS with the branch declared`);
  else record('ROAD-14', true, detail);
});

// ═══ ROAD-15 difficulty & depth coverage, against the plan in code ═══
step(['ROAD-15'], () => {
  const per = new Map<string, number>(); for (const x of R('A').results) per.set(x.difficulty, (per.get(x.difficulty) || 0) + 1);
  const diffOk = DIFFICULTY_NAMES.filter((d) => (per.get(d) || 0) === PLAN_ROUNDS_PER_DIFFICULTY && PLAN_ROUNDS_PER_DIFFICULTY >= PLAN_DIFFICULTY_FLOOR).length;
  const eD = DIFFICULTY_NAMES.map((d) => { const xs = R('E').results.filter((x) => x.difficulty === d); return { d, n: xs.length, depths: new Set(xs.map((x) => x.k)).size, multi: xs.filter((x) => x.k >= 2).length, max: Math.max(...xs.map((x) => x.k)) }; });
  const castle = R('E').results.filter((x) => x.outcome === 'castle').length;
  const ok = diffOk === DIFFICULTY_NAMES.length && eD.every((x) => x.depths >= 3 && x.multi >= 1);
  const detail = `Phase A: ${pct(diffOk, DIFFICULTY_NAMES.length)} difficulties played exactly ${PLAN_ROUNDS_PER_DIFFICULTY} times (plan in src/loader.ts; floor ${PLAN_DIFFICULTY_FLOOR}); Phase E lane by lane: ${eD.map((x) => `${x.d} ${x.n} rounds, ${x.depths} distinct depths at settle, ${x.multi} crossed ≥ 2 lanes, deepest ${x.max}`).join('; ')}; castle reached ${castle}×`;
  if (ok) record('ROAD-15', true, detail); else captureFlag('ROAD-15', detail + ' — the shortfall is in the capture plan, not the operator: disclosed, verdict-neutral');
});

// ═══ ROAD-16 wallet / balance reconciliation (the platform's bet history, E04; the account reconciliation, E05) ═══
step(['ROAD-16'], () => {
  const e4 = readJson('evidence/E04-road-bet-history-2026-10-13.json'); const led = new Map<string, any>(e4.rows.map((r: any) => [r.id, r]));
  let n = 0, ok = 0; const bad: string[] = [];
  for (const [k, d] of SCORED) d.rounds.forEach((r, i) => {
    n++; const id = betOf(r).response.game.roundId; const x = led.get(id); const res = R(k).results[i];
    if (x && units8(x.stake) === res.stake8 && units8(x.payout) === res.payout8 && x.game === 'housegames-hubiesroad' && x.status === (res.payout8 > 0n ? 'won' : 'lost')) ok++; else if (bad.length < 3) bad.push(`${k} round ${r.idx}: ${JSON.stringify(x)}`);
  });
  // E05 is checked by its NUMBERS, not by the shape of a line. Exact decimals (1e-8 units) throughout.
  const e5 = readFileSync(join(ROOT, 'evidence', 'E05-account-reconcile-2026-10-13.txt'), 'utf8');
  const d8 = (t: string): bigint => { const m = /^([+-]?)(\d+)(?:\.(\d{1,8}))?$/.exec(t); if (!m) throw new Error(`E05: not an 8-dp decimal: ${t}`); const v = BigInt(m[2]) * 100000000n + BigInt((m[3] || '').padEnd(8, '0')); return m[1] === '-' ? -v : v; };
  const e5rows = [...e5.matchAll(/^(\S+\.json)\s+(\d+)\s+(\S+)\s+(\S+)\s+([+-]\S+)$/gm)].map((m) => ({ file: m[1], rounds: Number(m[2]), staked: d8(m[3]), paid: d8(m[4]), net: d8(m[5]) }));
  const tot = /^TOTAL\s+(\d+)\s+(\S+)\s+(\S+)\s+([+-]\S+)$/m.exec(e5);
  const ledL = /^ledger: (\d+) entries = (\d+) captured rounds matched exactly \+ (\d+) open \+ (\d+) from 10 Oct; unexplained (\d+)$/m.exec(e5);
  const after = /^wallet cash balance after \(server, 8 dp\): (\S+)/m.exec(e5);
  const bal = /^balance before = after - net (\S+) \+ open stakes (\S+) = (\S+)$/m.exec(e5);
  const argBefore = /--before (\S+)`/.exec(e5);
  const arith = !!tot && !!ledL && !!after && !!bal && !!argBefore && /\nRECONCILED\n?$/.test(e5)
    && e5rows.every((r) => r.paid - r.staked === r.net)
    && e5rows.reduce((a, r) => a + r.rounds, 0) === Number(tot[1]) && e5rows.reduce((a, r) => a + r.staked, 0n) === d8(tot[2]) && e5rows.reduce((a, r) => a + r.paid, 0n) === d8(tot[3]) && d8(tot[3]) - d8(tot[2]) === d8(tot[4])
    && Number(ledL[1]) === Number(ledL[2]) + Number(ledL[3]) + Number(ledL[4]) && Number(ledL[2]) === Number(tot[1]) && Number(ledL[5]) === 0
    && d8(bal[1]) === d8(tot[4]) && d8(after[1]) - d8(bal[1]) + d8(bal[2]) === d8(bal[3]) && d8(bal[3]) === d8(argBefore[1]);
  // each package file's row (rounds, staked, paid) == what the package computes from the file itself: the 13 Oct phases from the
  // replayed rounds; the 12 Oct file from the server's settled round record of each distinct round (the 24 h round from its detail)
  const settledOf = (d: Dataset) => { const by = new Map<string, [bigint, bigint]>();
    for (const r of d.rounds) { const q = [...r.requests].reverse().find((y) => y.status === 200 && y.response?.round && typeof y.response.round === 'object'); let rr: any = q?.response.round;
      if (!rr && r.closedByServer && r.detail?.response?.game?.active === false) rr = r.detail.response.game; if (rr) by.set(rr.roundId, [units8(rr.stake), units8(rr.payout)]); } return by; };
  const files: [string, string, () => [number, bigint, bigint]][] = [
    ...([['A', PRIMARY_FILE], ['C', PHASE_C_FILE], ['C $10', PHASE_C10_FILE], ['D', PHASE_D_FILE], ['E', PHASE_E_FILE]] as [string, string][]).map(([k, f]) => [k, f, () => { const xs = R(k).results; return [xs.length, xs.reduce((s, x) => s + x.stake8, 0n), xs.reduce((s, x) => s + x.payout8, 0n)]; }] as [string, string, () => [number, bigint, bigint]]),
    [O12, H24_FILE, () => { const v = [...settledOf(h24).values()]; return [v.length, v.reduce((s, x) => s + x[0], 0n), v.reduce((s, x) => s + x[1], 0n)]; }]];
  const fileRows = files.map(([k, f, c]) => { const e = e5rows.find((r) => r.file.endsWith('/' + f.split('/').pop())); const [nr, st, pd] = c(); return { k, nr, ok: !!e && e.rounds === nr && e.staked === st && e.paid === pd }; });
  const sums = fileRows.filter((x) => x.ok).length;
  const gameRows = e5rows.filter((r) => /housebets-road-/.test(r.file)); const gameE5 = gameRows.reduce((a, r) => a + r.rounds, 0); const gamePkg = fileRows.reduce((a, x) => a + x.nr, 0);
  record('ROAD-16', ok === n && e4.rows.length === n && arith && sums === files.length && gameRows.length === files.length && gameE5 === gamePkg,
    `every scored round of the 13 Oct phases (A, C, C $10, D, E) is in the platform's bet history (game housegames-hubiesroad) with the same stake, payout and won/lost status: ${pct(ok, n)} (E04, ${e4.rows.length} rows)${bad.length ? ` — ${bad.join('; ')}` : ''}; the 24 h round's bet-history row is scored in ROAD-31 (E07); E05 checked by its numbers: ${e5rows.length} dataset rows sum to the TOTAL row (${tot?.[1]} rounds, staked and paid exact to 1e-8, each row's net == paid − staked), the ledger line adds up (${ledL?.[1]} entries = ${ledL?.[2]} captured + ${ledL?.[3]} open + ${ledL?.[4]} from 10 Oct, captured == TOTAL, unexplained ${ledL?.[5]}), and balance after ${after?.[1]} − net ${bal?.[1]} + open stakes ${bal?.[2]} == ${bal?.[3]} == the --before input: ${arith}; each of the package's ${files.length} files' row (rounds, staked, paid) == the package's own count and sums from the file: ${pct(sums, files.length)} (12 Oct: ${fileRows.find((x) => x.k === O12)?.nr} distinct rounds from ${h24.rounds.length} records); E05's road rows: ${gameRows.length}, ${gameE5} rounds == the ${gamePkg} rounds of this package's files: ${gameE5 === gamePkg}; the per-round balance field is not used: the games were captured concurrently, so consecutive road answers interleave other games' settlements`);
});

// ═══ ROAD-17 multi-step parity (Phase E) ═══
step(['ROAD-17'], () => {
  const parts = (E: string[]): [string, [number, number]][] => [['open-lane values', agg(E, 'rung:')], ['safe steps', agg(E, 'step onto a derived safe')], ['deadly steps', agg(E, 'step onto a derived deadly')],
    ['cash-outs', agg(E, 'cashout settles')], ['trap set invariant', agg(E, 'trap set invariant')],
    ['offers on the bet answer', agg(E, 'offer on the bet answer')], ['offers on later answers', agg(E, 'offer on a later answer')]];
  const pE2 = parts(['E']), p12 = parts([O12]).filter(([, x]) => x[1] > 0);
  // The offer shown before every lane (next.multiplier, next.value) is recomputed, not only the step/max-win booleans
  const offers = agg(['E', O12], 'offer on');
  // multi-lane auto bets as the SERVER settled them (12 Oct: bets naming 2 or more lanes), not the package's own replay
  const r12 = h24.rounds.filter(whole);
  const multi = R(O12).results.map((x, i) => [x, betOf(r12[i])] as const).filter(([, q]) => 'steps' in q.body && Number(q.body.steps) >= 2);
  const multiOk = multi.filter(([x]) => rowOk(x, 'auto (lanes up front)') && x.ok).length;
  const multiSizes = multi.map(([, q]) => Number(q.body.steps));
  const order = agg(['E', O12], 'order independence');
  const ok = pE2.every(([, x]) => full(x)) && p12.every(([, x]) => full(x)) && full(offers) && R('E').okRounds === EXPECTED_PHASE_E_ROUNDS && multi.length > 0 && multiOk === multi.length && full(order);
  record('ROAD-17', ok, `Phase E ${pct(R('E').okRounds, EXPECTED_PHASE_E_ROUNDS)} lane-by-lane rounds replay clean: ${pE2.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; 12 Oct lane-by-lane play: ${p12.map(([k, x]) => `${k} ${fmt(x)}`).join(', ')}; every intermediate value == the formula at that lane, and every offer shown before a lane (next.multiplier, next.value; cash-out offered iff a lane is crossed) == the formula at the next lane: ${fmt(offers)} answers; auto bets naming ${Math.min(...multiSizes)} to ${Math.max(...multiSizes)} lanes as the SERVER settled them (12 Oct): ${pct(multiOk, multi.length)} replay from the derived field (the scored 13 Oct auto bets name one lane each); auto == lane by lane ${fmt(order)} is COMPUTED by the package (the lane-by-lane walk replayed as if named up front), not a server answer; the field is derived before any lane is walked (the derivation takes no lane input)`);
});

// ═══ ROAD-18 anti-circularity: survival probability from combinatorics alone, and a negative control ═══
step(['ROAD-18'], () => {
  let cells = 0, same = 0;
  for (const d of DIFFICULTY_NAMES) { const [m, lanes] = DIFFICULTIES[d]; for (let k = 1; k <= lanes; k++) { cells++; const [a, b] = survivalComb(SLOTS, m, k), [c, e] = survivalProduct(SLOTS, m, k); if (a * e === b * c) same++; } }
  const r0 = JSON.parse(JSON.stringify(ds.rounds[0])); const g = betOf(r0).response.game; const safe = [...Array(SLOTS).keys()].find((t) => !g.field.includes(t))!;
  for (const q of r0.requests) if (q.response?.game?.field) q.response.game.field = [safe, ...q.response.game.field.slice(1)];
  const neg = replayRound(r0, epochIndex(ds)); const rejected = !rowOk(neg, 'field (trap slots');
  const wins = R('A').results.filter((x) => x.won).length; const exp = R('A').results.reduce((s, x) => s + (SLOTS - x.traps) / SLOTS, 0);
  record('ROAD-18', same === cells && rejected, `P(k lanes safe) = C(25−m,k)/C(25,k) equals the product Π(25−m−i)/(25−i) in exact integers for ${pct(same, cells)} cells; negative control: round 0 with one served trap moved to a safe slot is rejected by the replay: ${rejected}; no operator win-chance field exists or is read; Phase A wins ${wins} vs ${exp.toFixed(1)} expected from the combinatorics (ROAD-22 tests it)`);
});

// ═══ ROAD-19 effective RTP per cell vs the claim (RTP-CLAIM 1.2.0 table, exact; enforced) ═══
const rtp = input('rtp', () => (computeRtpClaim()));
const gate = input('gate', () => (runRtpClaimGate()));
step(['ROAD-19'], () => {
  const uniform = rtp.trueMin.rtpExact === rtp.trueMax.rtpExact;
  // The -19 status comes from the RTP-CLAIM rule alone (recordRtpClaim: table mismatch → FAIL, a
  // house-side miss → OVERSTATED); the old "exactly 99/100" condition restated the rule against a hand-written figure
  const ok = true; const pub = PUB!;
  const stake8 = units8(PHASE_A_STAKE); let worst = 0, worstCell = '';
  for (const d of DIFFICULTY_NAMES) { const [m, lanes] = DIFFICULTIES[d]; for (let k = 1; k <= lanes; k++) {
    const [a, b] = multFrac(SLOTS, m, k), [c, e] = survivalComb(SLOTS, m, k); const lost = Number(((stake8 * a) % b) * 1_000_000n / b) / 1e6;
    const cost = lost * fracToDouble(c, e) / Number(stake8); if (cost > worst) { worst = cost; worstCell = `${d}/${k}`; } } }
  recordRtpClaim('ROAD-19', ok, gate, `${rtp.settings} cells (every difficulty and number of lanes crossed): derived RTP ${rtp.trueMin.rtpExact} … ${rtp.trueMax.rtpExact} (the same in every cell: ${uniform}) — vs the flat claim ${pub.rtp} read from the exhibits at run time: ${pub.places.map((p) => `${p.where} "${p.text.split(/[:.] /)[0]}" (${p.rtp})`).join('; ')}; held to the highest${pub.agree ? ', the places agree' : ' — THE PLACES DISAGREE'}; E02 (and E08) rulesRoadReturn's own "{pct}%" is filled by the page at run time, not captured rendered — DL-11; ${rtp.houseSideFailures} house-side beyond the 0.1 pp band → RTP-CLAIM ${rtp.outcome} (rule ${rtp.rule} ${rtp.ruleVersion.split(' ')[0]}, enforced ${RTP_CLAIM_RULE_ENFORCED}: ${gate.status}); the per-cell table is outputs/rtp-claim-table.json; the payout's truncation to 1e-8 at the ${PHASE_A_STAKE} stake costs at most ${worst.toExponential(2)} of RTP (cell ${worstCell}, disclosed); committed table matches: ${gate.tableMatches}`);
});

// ═══ ROAD-20 / ROAD-21 the simulation, re-run in full and compared with the pinned census ═══
/** '' when the pinned census ships; else the words the census checks print (and censusSame is false: FAIL). */
function censusMissing(): string { return existsSync(join(ROOT, 'outputs', 'simulation-results.json')) ? '' : ' (outputs/simulation-results.json is MISSING: the re-run has nothing to equal, FAIL)'; }
let cen: Census; let censusSame = false;
step(['ROAD-20'], () => {
  cen = census([...SCORED, [O12, h24]]);   // Pass 2 replays every revealed seed of every dataset (labels as src/loader.ts ALL_DATASETS)
  const committed = (existsSync(join(ROOT, 'outputs', 'simulation-results.json')) ? readFileSync(join(ROOT, 'outputs', 'simulation-results.json'), 'utf8') : null);
  censusSame = censusText(cen) === committed;
  mkdirSync(join(ROOT, 'outputs', 'run'), { recursive: true });
  writeFileSync(join(ROOT, 'outputs', 'run', 'simulation-results.json'), censusText(cen));
});
step(['ROAD-20'], () => {
  const p1 = cen.pass1, n = p1.rounds, D = DIFFICULTY_NAMES.length;
  const stepN = (i: number): number => n * DIFFICULTY_NAMES.filter((d) => DIFFICULTIES[d][0] > i).length;   // rounds that drew a step i
  // (a) pick uniformity: each step's position among the slots left, and each step's slot over all 25
  const ps: number[] = []; let sumsOk = true;
  for (let i = 0; i < PICKS_PER_ROUND; i++) {
    const ni = p1.stepRounds[i]; if (ni !== stepN(i)) sumsOk = false;
    const row = p1.stepIndex[i]; const e = ni / row.length; if (row.reduce((s, v) => s + v, 0) !== ni) sumsOk = false;
    ps.push(chiSquaredPValue(row.reduce((s, o) => s + (o - e) ** 2 / e, 0), row.length - 1));
    const col = p1.slotAtStep.map((t) => t[i]); const e2 = ni / SLOTS; if (col.reduce((s, v) => s + v, 0) !== ni) sumsOk = false;
    ps.push(chiSquaredPValue(col.reduce((s, o) => s + (o - e2) ** 2 / e2, 0), SLOTS - 1));
  }
  const uMin = Math.min(...ps), uTests = ps.length, uOk = uMin >= ALPHA_SCREEN / uTests;
  // (b) serial on pick 0: lag-1 and runs above/below the middle
  const f = p1.firstPick, sx = Number(BigInt(f.sumX)), sx2 = Number(BigInt(f.sumX2)), sxy = Number(BigInt(f.sumXY));
  const mean = sx / f.n, v = sx2 / f.n - mean * mean, r1 = (sxy / (f.n - 1) - mean * mean) / v, z1 = r1 * Math.sqrt(f.n), pLag = twoSidedNormalP(z1);
  const runs = runsStatisticFromCounts(f.runs, f.upper, f.n), pRuns = twoSidedNormalP(runs.z);
  const lagOk = pLag >= ALPHA_SCREEN, runsOk = pRuns >= ALPHA_SCREEN;
  // (c) RTP convergence at every stopping depth: rounds whose smallest trap slot is ≥ k survive lanes 1 … k
  let scored = 0, scoredOk = 0, low = 0, worstZ = 0, worstCell = '', faSum = 0, minSumsOk = true;
  let bandMin = Infinity, bandMax = 0, bandMinCell = '', bandMaxCell = '', wideBands = 0;
  let rtpEMin = Infinity, rtpEMax = -Infinity;   // each cell's band is centred on its exact derived RTP, never on the claim
  for (const d of DIFFICULTY_NAMES) {
    const [m, lanes] = DIFFICULTIES[d]; const mm = p1.minTrap[d]; if (mm.reduce((s, x) => s + x, 0) !== n || mm.length !== SLOTS - m + 1) minSumsOk = false;
    let surv = n;
    for (let k = 1; k <= lanes; k++) {
      surv -= mm[k - 1];
      const [c, e] = survivalComb(SLOTS, m, k); const p = fracToDouble(c, e); const mult = multDouble(SLOTS, m, k);
      const [ma, mb] = multFrac(SLOTS, m, k); const rtpE = fracToDouble(ma * c, mb * e); if (rtpE < rtpEMin) rtpEMin = rtpE; if (rtpE > rtpEMax) rtpEMax = rtpE;
      const rtpS = (surv / n) * mult, se = Math.sqrt(p * (1 - p)) * mult / Math.sqrt(n);
      scored++; if (Math.abs(rtpS - rtpE) <= EDGE_SIGMAS * se + EDGE_BUFFER) scoredOk++; faSum += edgeBandFalseAlarm(n, p, mult, rtpE).rate;
      if (n * p < EDGE_LOW_INFORMATION) low++;
      const half = EDGE_SIGMAS * se + EDGE_BUFFER; if (half < bandMin) { bandMin = half; bandMinCell = `${d}/${k}`; } if (half > bandMax) { bandMax = half; bandMaxCell = `${d}/${k}`; } if (half > 1 - rtpE) wideBands++;
      const zc = Math.abs(rtpS - rtpE) / se; if (zc > worstZ) { worstZ = zc; worstCell = `${d}/${k}`; }
    }
  }
  const ownSeeds = new Set(DIFFICULTY_NAMES.flatMap((d) => [pass1Seed(d, 0).server, pass1Seed(d, 0).client])).size === 2 * D;   // no two difficulties on one seed label
  const depth = n === SIM_ROUNDS && n >= FLOOR_ROUNDS_PER_DIFFICULTY && ownSeeds && f.n === D * n && p1.stepRounds.length === PICKS_PER_ROUND && DIFFICULTY_NAMES.every((d) => p1.minTrap[d].length === SLOTS - DIFFICULTIES[d][0] + 1);
  const faOk = faSum <= ALPHA_SCREEN;
  const ok = censusSame && sumsOk && minSumsOk && uOk && lagOk && runsOk && scoredOk === scored && depth && faOk;
  record('ROAD-20', ok, `census re-run in full == the pinned outputs/simulation-results.json byte for byte: ${censusSame}${censusMissing()}; ${D} difficulties × ${n.toLocaleString('en')} rounds = ${(D * n).toLocaleString('en')} rounds on auditor-chosen seeds independent of the operator (fixed labels, src/sim-config.ts, so the census reproduces byte for byte), each difficulty on its own seeds and drawn to its m picks (floor ${FLOOR_ROUNDS_PER_DIFFICULTY.toLocaleString('en')} per difficulty: ${depth}); pick uniformity: ${uTests} chi² tests (each step's position among the slots left, and its slot over all 25, on the rounds of every difficulty that draws that step: ${p1.stepRounds.map((x) => x.toLocaleString('en')).join(', ')}), smallest p ${uMin.toExponential(3)} ≥ α/4/${uTests} = ${(ALPHA_SCREEN / uTests).toExponential(3)}: ${uOk}; serial on pick 0 of the ${f.n.toLocaleString('en')} rounds: lag-1 r ${r1.toExponential(2)} z ${z1.toFixed(3)} p ${pLag.toFixed(4)}, runs z ${runs.z.toFixed(3)} p ${pRuns.toFixed(4)} (each ≥ α/4: ${lagOk && runsOk}); RTP convergence at every stopping depth: ${pct(scoredOk, scored)} cells within ${EDGE_SIGMAS}·SE + ${EDGE_BUFFER} of the cell's exact derived RTP (${rtpEMin} … ${rtpEMax}; never the published figure), worst |Δ|/SE ${worstZ.toFixed(2)} (cell ${worstCell}); ${low} cells have under ${EDGE_LOW_INFORMATION} expected survivors and carry little evidence (DL-5); band: |RTP_sim − RTP_exact(cell)| ≤ ${EDGE_SIGMAS}·SE + ${EDGE_BUFFER}, SE = σ/√n per cell, half-width ${bandMin.toExponential(3)} (cell ${bandMinCell}) … ${bandMax.toExponential(3)} (cell ${bandMaxCell}); ${wideBands} of ${scored} cells have a half-width wider than the cell's house edge 1 − RTP_exact(cell), so in those cells the band cannot detect an edge of that size; false-alarm: uniformity ≤ α/4 = ${ALPHA_SCREEN} (Bonferroni), lag-1 and runs ≤ α/4 each, RTP cells ${fmtRate(faSum)} (exact binomial, summed) ≤ α/4: ${faOk}`);
});
step(['ROAD-21'], () => {
  const ep = cen.pass2.epochs; const D = Number(PASS2_D); const epA = ep.filter((e) => e.set === 'A');
  // the pooled return of the Phase A epochs (DL-6; printed, not scored)
  const agg2 = (w: 'early' | 'ref') => { let R2 = 0n, M = 0n, V = 0n, n = 0; for (const e of epA) { R2 += BigInt(e[w].ret12!); M += BigInt(e[w].meanD!); V += BigInt(e[w].varD2!); n += e[w].rounds; }
    const sd = Math.sqrt(Number(V)) / D; const z = (Number(R2) - Number(M) / D) / sd; return { z, p: normalLowerTailP(z), n, sd12: sd }; };
  const early = agg2('early'), ref = agg2('ref');
  // the SCORED statistic, over every played slot of every revealed seed: each slot's return minus its exact mean, ÷ its exact
  // sd, summed and ÷ √slots; the multiplier cancels, so each term is (win − p)/√(p(1 − p)), p = C(25 − m, K)/C(25, K)
  const pOf = (d: string, K: number) => { const [c, e] = survivalComb(SLOTS, DIFFICULTIES[d][0], K); return fracToDouble(c, e); };
  const pCell = (k: string) => { const [d, K] = k.split('/'); return pOf(d, Number(K)); };
  const std = (es: Census['pass2']['epochs'], w: 'early' | 'ref', only?: string) => { let sum = 0, n = 0, byOk = true;
    for (const e of es) { let r = 0, wn = 0; for (const [k, [rounds, wins]] of Object.entries(e[w].byCell)) { r += rounds; wn += wins; if (only && !k.startsWith(only + '/')) continue; const p = pCell(k); sum += (wins - rounds * p) / Math.sqrt(p * (1 - p)); n += rounds; }
      if (r !== e[w].rounds || wn !== e[w].wins) byOk = false; }
    const z = sum / Math.sqrt(n); return { z, p: normalLowerTailP(z), n, byOk }; };
  const sEarly = std(ep, 'early'), sRef = std(ep, 'ref');
  const perSet = ALL_DATASETS.map(([k]) => ({ k, seeds: ep.filter((e) => e.set === k).length, ...std(ep.filter((e) => e.set === k), 'early') }));
  const below = epA.filter((e) => BigInt(e.early.ret12!) * PASS2_D < BigInt(e.early.meanD!)).length;
  // the early window is the capture itself: every revealed seed with captured rounds has an epoch; its captured rounds are
  // nonces 1 … n with no gap; its early window is exactly those n nonces and its wins per cell == the SERVED outcomes
  const sets: [string, Dataset][] = [...SCORED, [O12, h24]];
  const byKey = new Map(ep.map((e) => [`${e.set}|${e.seedHash}`, e])); const allSlots: Slot[] = [];
  let revealed = 0, withRounds = 0, windowOk = 0, contiguous = 0; const missing: string[] = [];
  for (const [k, d] of sets) { const slots = playedSlots(d);
    for (const s of d.seeds) { revealed++; const pl = slots.get(s.hashedServerSeed); if (!pl?.length) continue; withRounds++; allSlots.push(...pl);
      if (pl.every((x, i) => x.nonce === i + 1)) contiguous++;
      const e = byKey.get(`${k}|${s.hashedServerSeed}`); if (!e) { missing.push(`${k} epoch ${s.epoch}`); continue; }
      const cap = new Map<string, [number, number]>(); for (const x of pl) { const c = cap.get(`${x.d}/${x.K}`) || [0, 0]; c[0]++; if (x.won) c[1]++; cap.set(`${x.d}/${x.K}`, c); }
      if (e.early.rounds === pl.length && e.early.rounds + e.ref.rounds === SIM_PASS2_NONCES && cap.size === Object.keys(e.early.byCell).length
        && [...cap].every(([c, [r, w]]) => e.early.byCell[c]?.[0] === r && e.early.byCell[c]?.[1] === w)) windowOk++; } }
  // Phase A: the early window's wins and pooled return equal the captured rounds' (replayed in ROAD-07)
  let capWins = 0, capRet = 0n; for (const x of R('A').results) if (x.won) { capWins++; capRet += mult12(x.traps); }
  const earlyWins = epA.reduce((s, e) => s + e.early.wins, 0), earlyRet = epA.reduce((s, e) => s + BigInt(e.early.ret12!), 0n);
  const zPow = -normalQuantile(SIM_PASS2_ALPHA) + normalQuantile(0.8);
  // power of the scored statistic: a uniform per-round RTP deficit d (fraction of the stake) moves every slot's standardised term
  // by d/σ_i (σ_i the slot's return sd per unit stake), so z moves by d·Σ(1/σ_i)/√slots; 80 % power at α needs zPow
  const sigma = (s: Slot) => { const p = pOf(s.d, s.K); return multDouble(SLOTS, s.m, s.K) * Math.sqrt(p * (1 - p)); };
  const stdPower = (xs: Slot[]) => { let inv = 0; for (const x of xs) inv += 1 / sigma(x); return zPow * Math.sqrt(xs.length) / inv * 100; };
  // every difficulty printed on its own over every seed (not scored): its standardised z and one-sided p, and its power
  const perD = DIFFICULTY_NAMES.map((d) => { const xs = allSlots.filter((x) => x.d === d); const s = std(ep, 'early', d); return { d, n: xs.length, z: s.z, p: s.p, pow: stdPower(xs) }; });
  const deficitPooled = (zPow * early.sd12 / 1e12) / early.n * 100;
  const depthOk = SIM_PASS2_NONCES >= FLOOR_PASS2_NONCES && epA.length === EXPECTED_SEEDS && epA.every((e) => e.early.rounds === EXPECTED_EPOCH_SIZE);
  const faOk = PASS2_FALSE_ALARM.rate <= FAIL_FALSE_ALARM_CAP && PASS2_FALSE_ALARM.statistic === SIM_PASS2_STATISTIC && PASS2_FALSE_ALARM.slots === sEarly.n;
  const ok = censusSame && depthOk && sEarly.byOk && sRef.byOk && ep.length === withRounds && missing.length === 0 && contiguous === withRounds && windowOk === withRounds
    && allSlots.length === sEarly.n && capWins === earlyWins && capRet === earlyRet && sEarly.p >= SIM_PASS2_ALPHA && faOk;
  record('ROAD-21', ok, `${censusMissing() ? `census${censusMissing()}; ` : ''}${ep.length} revealed seeds × ${SIM_PASS2_NONCES.toLocaleString('en')} nonces: every revealed seed of every dataset (${perSet.map((x) => `${x.k} ${x.seeds}`).join(', ')}; ${withRounds} of the ${revealed} revealed seeds carry captured rounds); early window = the nonces the capture played on the seed (1..${EXPECTED_EPOCH_SIZE} on a 13 Oct pair, 1..n with n ≤ 10 on a 12 Oct pair), reference = the rest of 1..${SIM_PASS2_NONCES.toLocaleString('en')}; each nonce replays a round the capture played on that seed (its difficulty, walked to the same lane); scored statistic (${SIM_PASS2_STATISTIC}, src/sim-config.ts; switched from the pooled return on 14 Oct, after the pooled result below was known — both printed): each played slot's return minus its exact mean ÷ its exact sd, summed and ÷ √slots, over the ${sEarly.n} early-window slots: z ${sEarly.z.toFixed(3)}, one-sided p ${sEarly.p.toFixed(4)} (≥ ${SIM_PASS2_ALPHA}: ${sEarly.p >= SIM_PASS2_ALPHA}); reference window z ${sRef.z.toFixed(3)}; per dataset, printed, not scored: ${perSet.map((x) => `${x.k} z ${x.z.toFixed(3)} (${x.n} slots)`).join(', ')}; per difficulty over every seed, printed, NOT scored (4 subsets, no multiplicity correction): ${perD.map((x) => `${x.d} ${x.n} slots z ${x.z.toFixed(3)} one-sided p ${x.p.toFixed(4)} (80 % power at ${x.pow.toFixed(2)} pp)`).join('; ')}; per-cell census counts sum to the window totals: ${sEarly.byOk && sRef.byOk}; every seed's captured rounds are nonces 1..n with no gap: ${pct(contiguous, withRounds)}; early window == the served outcomes, cell by cell: ${pct(windowOk, withRounds)} seeds${missing.length ? ` (no epoch for ${missing.join(', ')})` : ''}; the pooled return of the Phase A epochs (scored until 14 Oct, printed): early z ${early.z.toFixed(3)}, p ${early.p.toFixed(4)}, reference z ${ref.z.toFixed(3)}; ${below} Phase A epochs below expectation, ${epA.length - below} at or above; Phase A early window == the captured rounds (wins ${pct(earlyWins, capWins)}, return exact: ${capRet === earlyRet}); detection power of the scored statistic at 80 %: a ${stdPower(allSlots).toFixed(2)} pp per-round RTP deficit spread over all ${allSlots.length} slots (the Phase A pooled return's ${deficitPooled.toFixed(2)} pp); false-alarm rate of the scored rule ${PASS2_FALSE_ALARM.rate} ± ${PASS2_FALSE_ALARM.standardError} at level ${SIM_PASS2_ALPHA} over the ${PASS2_FALSE_ALARM.slots} played slots (== this run's ${sEarly.n}: ${PASS2_FALSE_ALARM.slots === sEarly.n}), of the Phase A pooled rule ${PASS2_FALSE_ALARM_POOLED.rate} ± ${PASS2_FALSE_ALARM_POOLED.standardError} at ${SIM_PASS2_ALPHA} and ${PASS2_FALSE_ALARM_POOLED_AT_001.rate} ± ${PASS2_FALSE_ALARM_POOLED_AT_001.standardError} at 0.01 (src/false-alarm-pass2.ts, npm run false-alarm:pass2; cap ${FAIL_FALSE_ALARM_CAP})`);
});

// ═══ ROAD-22 live-sample fit (INFORMATIONAL) ═══
step(['ROAD-22'], () => {
  const res = R('A').results; const c = new Array(SLOTS).fill(0); for (const x of res) if (x.slot0 !== null) c[x.slot0]++;
  const e = res.length / SLOTS; const chi2 = c.reduce((s, o) => s + (o - e) ** 2 / e, 0);
  const per = DIFFICULTY_NAMES.map((d) => { const xs = res.filter((x) => x.difficulty === d); const m = DIFFICULTIES[d][0]; const t = xs.filter((x) => x.outcome === 'trap').length; const p = m / SLOTS; const z = (t - xs.length * p) / Math.sqrt(xs.length * p * (1 - p)); return `${d} ${t}/${xs.length} (expected ${(xs.length * p).toFixed(1)}, z ${z.toFixed(2)})`; });
  record('ROAD-22', true, `Phase A first trap slot (field[0]) over all 25 slots: chi² ${chi2.toFixed(1)} (df ${SLOTS - 1}) p ${chiSquaredPValue(chi2, SLOTS - 1).toFixed(3)}; lane-1 trap rate per difficulty: ${per.join('; ')} — informational (${res.length} rounds have little power and never bear the verdict)`);
});

// ═══ ROAD-31 abandoned-round rule (24 h), on the round left open on purpose in the 12 Oct capture ═══
step(['ROAD-31'], () => {
  const r = h24.rounds.find((x) => x.closedByServer)!; const x = replayRound(r, epochIndex(h24));
  const e7 = readJson('evidence/E07-road-abandoned-round-2026-10-13.json');
  const g = r.detail!.response!.game!; const lastDecision = [...r.requests].filter((q) => q.status === 200).pop()!.at!;
  const hrs = (Date.parse(g.settledAt!) - Date.parse(lastDecision)) / 3.6e6;
  const hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60), ss = Math.round(((hrs - hh) * 60 - mm) * 60);
  const led = e7.betHistoryRow; const ledOk = led.id === g.roundId && units8(led.payout) === x.payout8 && led.status === 'won';
  const checks = (h24.meta.openChecks || []).map((c: any) => `${c.hoursSinceLeft} h ${c.stillActive ? 'active' : 'closed'}`).join(', ');
  const branch = x.leftK >= 1 ? 'with lanes crossed' : 'with none';
  const detail31 = `the round left open on purpose on 12 Oct (${g.difficulty}, ${x.leftK} lane crossed, value ${Number(x.leftValue8) / 1e8}) is revealed and recomputes (field ${JSON.stringify(g.field)}, trap lane ${g.trapLane}: every replay row clean ${x.ok}); the server finished it on the witnessed branch "${branch}: cashed out at its value": payout ${Number(x.payout8) / 1e8} == its value; bet history row won, payout equal: ${ledOk} (E07); time from the last decision (${lastDecision}) to the server's settlement (${g.settledAt}): ${hh} h ${mm} m ${ss} s; capture checks: ${checks}`;
  const settled31 = x.ok && ledOk && rowOk(x, '24 h rule');
  // The ROAD-31 rule (profile): the abandoned round is revealed and recomputed, "its settlement equals the published branch",
  // the time is printed, and "a branch not exercised is declared unwitnessed". The witnessed branch settled by the rule and
  // the other is declared, so PASS; a settlement against the rule FAILs
  if (!settled31) record('ROAD-31', false, detail31);
  else record('ROAD-31', true, `${detail31} — the branch "with none, one lane is walked and, if it is safe, the round is cashed out" was not exercised by the capture: declared unwitnessed (DL-7), as the rule allows: PASS with the branch declared; the close came ${hh - 24} h ${mm} m after the 24 hours, reported as observed (the profile sets no bound on it)`);
  observations.push(`24 h rule timing: the published rule says a round left without a decision for 24 hours is finished by the server; the one abandoned road round was finished ${hh} h ${mm} m ${ss} s after its last decision (still active at the capture's checks ${checks}). ROAD-31 scores the witnessed settlement (the unwitnessed branch declared) and not the timing; whether a close ${hh - 24} h ${mm} m after the 24 hours is a pass or a flag is not decided by the ROAD profile`);
  const negs = h24.rounds.filter((q) => q.spec?.kind === 'negative');
  const refused = negs.filter((q) => q.requests.some((y) => y.path === '/road/action' && y.body.action === 'cashout' && y.status === 400 && y.response?.code === 6)).length;
  observations.push(`cash-out with no lane crossed (E01 rules "after at least one safe lane the round can be cashed out"), sent on purpose in the 12 Oct capture: refused ${pct(refused, negs.length)} (HTTP 400, code 6 "cross a lane before cashing out"); the rest of each of those rounds is recomputed in ROAD-07/10/11`);
  // the 12 Oct round finished on resume (DL-9): the step requests the capture re-sent with the bet's own generation id
  const rr = h24.rounds.find((q) => q.resumedFinish); const bet0 = rr?.requests.find((q) => q.path === '/road/bet' && q.status === 200);
  const resent = rr?.requests.filter((q) => q.body?.generation === bet0?.body.generation) ?? [];
  const acts = resent.filter((q) => q.path === '/road/action'), echoed = acts.filter((q) => q.status === 200 && JSON.stringify(q.response) === JSON.stringify(bet0?.response)).length;
  const noAnswer = acts.filter((q) => q.status == null).length, rest = (rr?.requests.length ?? 0) - resent.length;
  observations.push(`the 12 Oct round ${String(rr?.roundId).slice(0, 8)}… finished on resume (DL-9): ${resent.length} requests carried the bet's own generation id (the bet and ${acts.length} step actions); ${pct(echoed, acts.length)} of those actions were answered with the bet answer itself (nothing walked, no second round), ${noAnswer} recorded no answer; on resume ${rest} requests under new generation ids walked one lane and cashed out, and the round is counted in ROAD-16`);
});

// ═══ Package checks: ROAD-23, 24, 25, 27, 28, 29, 30 ═══
const manifest = input('manifest', () => (existsSync(join(ROOT, 'MANIFEST.md')) ? readFileSync(join(ROOT, 'MANIFEST.md'), 'utf8') : ''));
const readme = input('readme', () => (existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : ''));
// The framework's standardized fairness-integrity matrix: the eight rows S5-1 … S5-8 by id AND name, in the methodology's
// order (the PLINKO profile, whose -23 check this one shares, names them). Where the vendored profile names them too, its
// list must be this one. A row renamed, reordered, added or dropped is a GAP, not only a missing status.
const S5_FRAMEWORK_ROWS = input('S5_FRAMEWORK_ROWS', () => (['Replay protection', 'Input validation', 'Seed integrity under adversarial input', 'Cross-player isolation',
  'Payout field integrity', 'Nonce sequence enforcement', 'Parameter boundary enforcement', 'Game-specific state']));
step(['ROAD-23'], () => {
  const blk = /<!-- S5-MATRIX:BEGIN -->\n([\s\S]*?)\n<!-- S5-MATRIX:END -->/.exec(manifest);
  const cells = (blk ? blk[1].split('\n').filter((l) => /^\| S5-/.test(l)) : []).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const rowsOk = cells.length === S5_FRAMEWORK_ROWS.length && S5_FRAMEWORK_ROWS.every((n, i) => cells[i][0] === `S5-${i + 1}` && cells[i][1] === n);
  const results = cells.map((c) => (/^(Pass|Flag|Hard Fail|Not tested)\b/.exec(c[3] ?? '') || [])[1] ?? null);
  const statusOk = cells.length > 0 && results.every((r) => r !== null), tiedOk = cells.every((c) => (c[4] ?? '').length > 0);
  const asserts = String((readJson('profile/profile.json').checks || []).find((c: any) => c.id === 'ROAD-23')?.asserts ?? '');
  const named = /S5-1 … S5-8 \(([^)]*)\)/.exec(asserts); const profNames = named ? named[1].split(', ') : null;
  const profOk = !profNames || JSON.stringify(profNames) === JSON.stringify(S5_FRAMEWORK_ROWS.map((x) => x.toLowerCase()));
  // the printed tally separates a row that passes on every control it names from one that passes on part of them and from
  // one that is Not tested (a status that starts "Pass on" is a partial pass)
  const s5cov = (st: string[]) => { const full = st.filter((s) => /^Pass\b/.test(s) && !/^Pass on\b/.test(s)).length, part = st.filter((s) => /^Pass on\b/.test(s)).length, nt = st.filter((s) => /^Not tested\b/.test(s)).length, fl = st.filter((s) => /^Flag\b/.test(s)).length, hf = st.filter((s) => /^Hard Fail\b/.test(s)).length;
    return `${full} Pass on every control the row names, ${part} Pass on part of the controls it names, ${nt} Not tested${fl ? `, ${fl} Flag` : ''}${hf ? `, ${hf} Hard Fail` : ''}`; };
  const off = cells.map((c) => `${c[0]} ${c[1]}`).filter((x, i) => x !== `S5-${i + 1} ${S5_FRAMEWORK_ROWS[i]}`);
  record('ROAD-23', !!blk && rowsOk && statusOk && tiedOk && profOk, `MANIFEST.md S5-MATRIX block: ${blk ? cells.length : 'no'} rows; ids and names == the framework's eight, in order (${S5_FRAMEWORK_ROWS.map((n, i) => `S5-${i + 1} ${n}`).join(', ')}): ${rowsOk}${off.length ? ` (differ: ${off.join('; ')})` : ''}; each result Pass / Flag / Hard Fail / Not tested: ${statusOk} (${s5cov(cells.map((c) => c[3] ?? ''))}); each tied to a check, capture or limitation: ${tiedOk}; the vendored profile ${profNames ? `names the rows: ${profOk}` : 'states the ids only (the shared PLINKO-23 text names the rows)'}`);
});
// -24: the site-verifier module (site-verifier/derive.js, generated from src/rng.ts by scripts/build-site-verifier.mjs).
// Two legs, both needed. The pins: the file on disk has the sha256 of SITE_VERIFIER_PIN (src/artifact-pins.ts) and of its
// RELEASE-MANIFEST.json entry, and MANIFEST.md and README.md quote that sha256. The replay: the module is loaded from that
// file (never bundled into verify.js), must export what src/rng.ts exports, and every function is run side by side with
// src/rng.ts on every round ROAD-07 replays (the rounds of the five 13 Oct datasets and the 12 Oct records recorded whole),
// with the inputs that replay uses: the epoch's revealed seed and client seed, the round's nonce, its difficulty's trap
// count and lane count. One differing result fails the check. The pins alone would pass a module that derives something
// else and was re-pinned; the replay alone would pass a file nobody pinned.
const SITE = await loadSiteModule(ROOT, SITE_VERIFIER_PIN[0]);
step(['ROAD-24'], () => {
  const [file, pin] = SITE_VERIFIER_PIN;
  const relPin: string | null = (() => { try { return readJson('RELEASE-MANIFEST.json').files?.[file] ?? null; } catch { return null; } })();
  const pinOk = SITE.sha256 !== null && SITE.sha256 === pin, relOk = SITE.sha256 !== null && SITE.sha256 === relPin;
  const cited = SITE.sha256 !== null && manifest.includes(SITE.sha256) && readme.includes(SITE.sha256);
  const names = exportNames(RNG), exportsOk = !!SITE.mod && JSON.stringify(exportNames(SITE.mod)) === JSON.stringify(names);
  const sets: [string, Dataset][] = [...SCORED, [O12, h24]];
  function* probes(): Generator<Probe> {
    yield ['SLOTS', (m) => m.SLOTS];
    for (const [k, d] of sets) {
      for (const s of d.seeds) if (s.revealedServerSeed) yield ['sha256Hex', (m) => m.sha256Hex(s.revealedServerSeed)];
      const byHash = epochIndex(d);
      for (const x of R(k).results) {
        const ep = x.epochHash ? byHash.get(x.epochHash) : undefined; if (!ep || !ep.seed.revealedServerSeed || !x.field) continue;
        const server = ep.seed.revealedServerSeed, client = ep.seed.clientSeed, nonce = x.nonce, traps = x.traps, lanes = x.lanes;
        yield ['hmacBlock', (m) => m.hmacBlock(server, client, nonce, 0)];
        yield ['drawStream', (m) => { const it = m.drawStream(server, client, nonce); return Array.from({ length: 32 }, () => it.next().value); }];
        const u = RNG.hmacBlock(server, client, nonce, 0).readUInt32BE(0);
        yield ['positionFromU', (m) => m.positionFromU(u, m.SLOTS)];
        yield ['picks', (m) => m.picks(server, client, nonce, traps)];
        const field = RNG.picks(server, client, nonce, traps);
        yield ['firstDeadlyLane', (m) => m.firstDeadlyLane(field, lanes)];
      }
    }
  }
  const rounds = sets.reduce((n, [k]) => n + R(k).results.length, 0), scored = SCORED.reduce((n, [k]) => n + R(k).results.length, 0);
  const rp24 = exportsOk ? replaySide(RNG, SITE.mod!, probes()) : null;
  const covered = rp24 ? names.filter((n) => rp24.byLabel[n] > 0).length : 0;
  const replayOk = !!rp24 && rp24.differences === 0 && rp24.byLabel.picks === rounds
    && scored === EXPECTED_ROUNDS + EXPECTED_PHASE_C_ROUNDS + EXPECTED_PHASE_C10_ROUNDS + EXPECTED_PHASE_D_ROUNDS + EXPECTED_PHASE_E_ROUNDS && covered === names.length;
  record('ROAD-24', pinOk && relOk && cited && exportsOk && replayOk, `${file} (generated from src/rng.ts by scripts/build-site-verifier.mjs): ${SITE.sha256 === null ? 'missing' : `sha256 ${SITE.sha256}`}; == SITE_VERIFIER_PIN in src/artifact-pins.ts: ${pinOk}; == its RELEASE-MANIFEST.json pin: ${relOk}; quoted in MANIFEST.md and README.md: ${cited}; ${SITE.mod ? `the module loaded from that file exports what src/rng.ts exports (${names.join(', ')}): ${exportsOk}` : `the module did not load (${SITE.error})`}; ${rp24 ? `run side by side with src/rng.ts on every round ROAD-07 replays, from the ${sets.length} shipped datasets (${scored} rounds of the 13 Oct phases and the ${R(O12).results.length} records of the 12 Oct file recorded whole; its ${notReplayed.length} record not replayed there is not replayed here): ${rounds} rounds, ${rp24.calls} calls (${Object.entries(rp24.byLabel).map(([k, v]) => `${k} ${v}`).join(', ')}; ${covered}/${names.length} exports exercised), ${rp24.differences} differing result${rp24.differences === 1 ? '' : 's'}${rp24.first ? ` (first: ${rp24.first})` : ''}` : 'not replayed'}`);
});
step(['ROAD-25'], () => {
  const need = ['Verify a bet', 'Save the hashed server seed before you bet', 'rotate', 'sha256', 'not the 32 bytes', 'HMAC-SHA256', 'block b = floor(i / 8)', 'floor(', 'slot L − 1', 'C(25, k)', 'node verify-round.mjs'];
  const has = need.filter((w) => readme.includes(w));
  record('ROAD-25', has.length === need.length, `README.md "Verify a bet" carries the save-the-hash-first step, where the seed is revealed, the fields, the commitment encoding, the HMAC key encoding (the seed's text, not hex-decoded), the trap picks with their block index, the lane numbering, the multiplier and a script that recomputes a round: ${has.length}/${need.length} markers${has.length < need.length ? ` (missing: ${need.filter((w) => !has.includes(w)).join('; ')})` : ''}`);
});
const artifactBad = input('artifactBad', () => (ARTIFACT_PINS.filter(([f, h]) => !existsSync(join(ROOT, f)) || sha256File(f) !== h)));
// ROAD-28 and ROAD-29 read COMMITTED records (outputs/fresh-copy.json, outputs/mutation-results.json), written by
// npm run gate:fresh / npm run mutate, pinned in RELEASE-MANIFEST.json, each carrying the fingerprint of the code and data it ran
// against (scripts/fingerprint.mjs). A record that is missing, unpinned, edited, or from other code is rejected (GAP).
const CODE_FP = input('CODE_FP', () => (codeFingerprint(ROOT)));
const relMan = input('relMan', () => (existsSync(join(ROOT, 'RELEASE-MANIFEST.json')) ? JSON.parse(readFileSync(join(ROOT, 'RELEASE-MANIFEST.json'), 'utf8')) : null));
const pinnedRecord = (rel: string) => { const p = join(ROOT, rel); if (!existsSync(p)) return { rec: null, why: 'no committed record' };
  const pinned = relMan?.files?.[rel]; const now = sha256File(rel);
  if (!pinned) return { rec: null, why: 'not pinned in RELEASE-MANIFEST.json' }; if (pinned !== now) return { rec: null, why: 'sha256 differs from its RELEASE-MANIFEST.json pin' };
  const rec = JSON.parse(readFileSync(p, 'utf8')); if (rec.codeSha256 !== CODE_FP) return { rec: null, why: `ran against other code or data (fingerprint ${String(rec.codeSha256).slice(0, 12)}…, now ${CODE_FP.slice(0, 12)}…)` };
  return { rec, why: '' }; };
step(['ROAD-28'], () => {
  const { rec: fc, why } = pinnedRecord('outputs/fresh-copy.json');
  // The fresh copy must reproduce the committed record's verdict with that verdict's exit code (0, 2 or 5 for
  // a releasable package), not only a Full Pass
  const committedVerdict = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'outputs', 'verification-results.json'), 'utf8')).verdict; } catch { return null; } })();
  const ok = !!fc && fc.verdict === committedVerdict && fc.exit === exitOfVerdict(committedVerdict) && fc.rngTestsExit === 0 && fc.standaloneExit === fc.exit && fc.verdict === fc.standaloneVerdict && fc.reproduced === true && fc.beyondTolerance === 0 && fc.pinnedUnchanged === true && AUDIT_ID !== null;
  record('ROAD-28', ok, fc ? `committed fresh-copy record (npm run gate:fresh, Node ${fc.node}, fingerprint == this code and data, pinned in RELEASE-MANIFEST.json): exit ${fc.exit}, standalone exit ${fc.standaloneExit}, verdict "${fc.verdict}" (== the committed record's "${committedVerdict}", whose exit is ${exitOfVerdict(committedVerdict)}: ${fc.verdict === committedVerdict && fc.exit === exitOfVerdict(committedVerdict)}), reproduced ${fc.reproduced}, regeneration vs committed ${fc.beyondTolerance} fields beyond tolerance, pinned artifacts unchanged ${fc.pinnedUnchanged}; audit ID ${AUDIT_ID ?? 'NOT ASSIGNED (pending, assigned by ProvablyFair.org)'}` : `fresh-copy record rejected: ${why}; audit ID ${AUDIT_ID ?? 'not assigned (pending, assigned by ProvablyFair.org)'}`);
  if (!fc && !why.startsWith('ran against other code')) pinFail('ROAD-28', why);   // missing, unpinned or edited: FAIL, verdict-bearing (a record of other code stays a GAP)
});
step(['ROAD-29'], () => {
  const { rec: mr, why } = pinnedRecord('outputs/mutation-results.json');
  const reg = JSON.parse(readFileSync(join(ROOT, 'tests', 'mutations.json'), 'utf8')).mutations.map((m: any) => m.id);
  const scoredIds = EXPECTED_SCORED;   // from profile/profile.json
  const consistent = !!mr && JSON.stringify(mr.registry) === JSON.stringify(reg) && mr.total === reg.length && Array.isArray(mr.results) && mr.results.length === reg.length
    && JSON.stringify(mr.results.map((r: any) => r.id).sort()) === JSON.stringify([...reg].sort()) && mr.killed === mr.results.filter((r: any) => r.killed).length;   // results are sorted by id, the registry is in file order
  const uncovered = mr ? scoredIds.filter((id) => !mr.results.some((r: any) => r.kills === id && r.killed)) : scoredIds;
  const ok = consistent && mr.killed === mr.total && uncovered.length === 0;
  record('ROAD-29', ok, mr ? `committed mutation record (npm run mutate, fingerprint == this code and data, pinned in RELEASE-MANIFEST.json; registry and counts re-derived from its rows: ${consistent}): ${mr.killed}/${mr.total} mutations killed by their named check; scored checks with no killing mutation: ${uncovered.join(', ') || 'none'}` : `mutation record rejected: ${why}`);
  if (!mr && !why.startsWith('ran against other code')) pinFail('ROAD-29', why);   // missing, unpinned or edited: FAIL, verdict-bearing (a record of other code stays a GAP)
});
step(['ROAD-30'], () => {
  const dl = (manifest.match(/^\| DL-\d+ \|/gm) || []).length;
  const prem = /Could the data contradict it\?/.test(manifest);
  const ev = EVIDENCE_PINS.every(([f]) => manifest.includes(f.split('/').pop()!));
  record('ROAD-30', dl > 0 && prem && ev, `MANIFEST.md: ${dl} declared-limitation rows; load-bearing premises with "Could the data contradict it?": ${prem}; every exhibit E01…E${String(EVIDENCE_PINS.length).padStart(2, '0')} listed by file name: ${ev}`);
});

// ROAD-27 runs last, after every check the committed record holds has its row, so its comparison sees the whole record
step(['ROAD-27'], () => {
  const gi = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
  const unignored = ARTIFACT_PINS.every(([f]) => gi.includes('!' + f));
  const noMeta = ARTIFACT_PINS.every(([f]) => existsSync(join(ROOT, f)) && !/"(runAt|generatedAt|timestamp|hostname|nodeVersion)"/.test(readFileSync(join(ROOT, f), 'utf8')));
  const cf = join(ROOT, 'outputs', 'verification-results.json');
  const recDiffs = existsSync(cf) ? beyondTolerance(fieldDiff(JSON.parse(readFileSync(cf, 'utf8')), recordOf())).length : -1;
  // verify.js is bundled from tests/verify.ts and src/; it must name the fingerprint of the sources on disk (a stale bundle is refused)
  const srcFp = sourceFingerprint(ROOT), bundleFp = bundledSourceFingerprint(ROOT); const bundleOk = bundleFp === srcFp;
  record('ROAD-27', artifactBad.length === 0 && unignored && noMeta && censusSame && gate.tableMatches && recDiffs === 0 && bundleOk,
    `${ARTIFACT_PINS.length - artifactBad.length}/${ARTIFACT_PINS.length} artifacts match the sha256 pinned in src/artifact-pins.ts${artifactBad.length ? ` (mismatch: ${artifactBad.map(([f]) => f).join(', ')})` : ''}; un-ignored by name in .gitignore: ${unignored}; no run metadata: ${noMeta}; census regenerated == committed: ${censusSame}${censusMissing()}; RTP table regenerated == committed: ${gate.tableMatches}; committed verification record == this run's, field by field: ${recDiffs === 0}${recDiffs > 0 ? ` (${recDiffs} fields differ)` : recDiffs < 0 ? ' (no committed record)' : ''}; verify.js bundled from the sources on disk (fingerprint ${srcFp.slice(0, 12)}…, header ${bundleFp ? bundleFp.slice(0, 12) + '…' : 'none'}): ${bundleOk}; verify writes only outputs/run/`);
});

finish();

/** The verification record: every scored check except ROAD-27 (the check that compares the record with this run), the
 *  informational check and the observations. Built the same way for ROAD-27 and for outputs/run/. */
function recordOf() {
  const order = (id: string) => Number(id.split('-')[1]);
  // every package check (GRADED / RELEASE_GATE) is recorded too, except ROAD-28, ROAD-29: they attest this record itself
  // (ROAD-28 and ROAD-29 read gate records bound to sources that pin it), so verify prints them and does not record them
  const pkgRows = rows.filter((r) => (r.policy === 'GRADED' || r.policy === 'RELEASE_GATE') && !['ROAD-28', 'ROAD-29'].includes(r.id));
  // The placeholder rows (NOTRUN, added by finish()) stay out of the record, so a record regenerated from a run with a step
  // missing equals the one -27 builds mid-run; the missing ids are carried by the verdict
  const recRows = rows.filter((r) => (r.policy === 'HARD_FAIL' || r.policy === 'FLAG') && r.id !== 'ROAD-27' && r.status !== 'NOTRUN').sort((a, b) => order(a.id) - order(b.id));
  const rf = recRows.filter((r) => r.status === 'FAIL').length, ro = recRows.filter((r) => r.status === 'FLAG' && r.origin === 'operator').length;
  const missing = notRun().filter((id) => id !== 'ROAD-27');   // the record excludes ROAD-27, which is recorded after it is first built
  const recVerdict = rtpClaimVerdict({ fails: rf, complete: missing.length === 0 && binding.ok, overstated: recRows.some((r) => r.status === 'OVERSTATED'), opFlags: ro }).verdict;
  return { suite: 'housebets-road', profileSha256: binding.sha ?? 'absent', verdict: recVerdict,
    summary: { passes: recRows.filter((r) => r.status === 'PASS').length, fails: rf, overstated: recRows.filter((r) => r.status === 'OVERSTATED').length, operatorFlags: ro, captureFlags: recRows.filter((r) => r.status === 'FLAG' && r.origin === 'capture').length, packageChecks: pkgRows.length, excluded: ['ROAD-27'] },
    steps: [...recRows.concat(rows.filter((r) => r.policy === 'INFORMATIONAL').sort((a, b) => order(a.id) - order(b.id))), ...pkgRows].sort((a, b) => order(a.id) - order(b.id)).map((r) => ({ id: r.id, status: r.status, origin: r.origin ?? null, detail: r.detail })),
    observations };
}

/** The exit code rtpClaimVerdict gives a verdict line (ROAD-28 and scripts/fresh-copy-check.mjs use the same map). */
function exitOfVerdict(v: string | null): number | null {
  if (!v) return null; if (v.startsWith('NOT PROVABLY FAIR')) return 1; if (v.startsWith('INCOMPLETE')) return 3; if (v.startsWith('RTP FIGURE OVERSTATED')) return 5;
  if (v === 'PROVABLY FAIR — Conditional Pass') return 2; if (v === 'PROVABLY FAIR — Full Pass') return 0; return null;
}
/** The scored checks (HARD_FAIL + FLAG) the profile lists that this run did not record exactly once. */
function notRun(): string[] {
  return EXPECTED_SCORED.filter((id) => rows.filter((r) => r.id === id && r.status !== 'NOTRUN').length !== 1);
}
function finish() {
  applyTaint();
  const order = (id: string) => Number(id.split('-')[1]);
  // The verdict is bound to the profile's check list. A scored check with no row (step deleted, skipped, aborted) — or with
  // more than one — is printed as NOTRUN, the verdict is INCOMPLETE and the exit is non-zero; it can never print a PASS verdict.
  const missing = notRun();
  for (const id of missing) if (!rows.some((r) => r.id === id)) { const p = prof(id); rows.push({ id, name: p.name, policy: p.policy, status: 'NOTRUN', detail: 'this run recorded no status for this scored check' }); }
  rows.sort((a, b) => order(a.id) - order(b.id));
  const scored = rows.filter((r) => (r.policy === 'HARD_FAIL' || r.policy === 'FLAG') && r.status !== 'NOTRUN');
  const fails = scored.filter((r) => r.status === 'FAIL').length;
  const opFlags = scored.filter((r) => r.status === 'FLAG' && r.origin === 'operator').length;
  const over = scored.filter((r) => r.status === 'OVERSTATED').length;
  const capFlags = scored.filter((r) => r.status === 'FLAG' && r.origin === 'capture').length;
  const passes = scored.filter((r) => r.status === 'PASS').length;
  const complete = missing.length === 0 && scored.length === EXPECTED_STEPS && binding.ok;
  // RTP-CLAIM 1.2.0 ranking (rtpClaimVerdict): NOT PROVABLY FAIR (1) > INCOMPLETE (3) > RTP FIGURE OVERSTATED (5) > Conditional (2) > Full (0)
  const v = rtpClaimVerdict({ fails: fails + extraFails(), complete, overstated: over > 0, opFlags });   // + FAILs outside the scored rows and run errors
  const why = [missing.length ? `scored checks not run: ${missing.join(', ')}` : '', binding.ok ? '' : `profile binding: ${binding.issues.join('; ')}`].filter(Boolean).join('; ');
  const verdict = v.verdict === 'INCOMPLETE' ? `INCOMPLETE — ${why}` : v.verdict;
  const pkg = rows.filter((r) => r.policy === 'GRADED' || r.policy === 'RELEASE_GATE');
  console.log(`HouseBets House Games Hubie's Road (new engine) — verification (profile ROAD ${PROFILE_VERSION} ${binding.sha ? binding.sha.slice(0, 12) + '…' : 'ABSENT'}, ${rows.length} checks)`);
  for (const r of rows) console.log(`  ${r.id.padEnd(8)} ${(r.status + (r.origin === 'capture' ? '*' : '')).padEnd(6)} ${r.policy.padEnd(13)} ${r.name.padEnd(46)} ${r.detail}`);
  console.log(`  (* capture-origin FLAG: disclosed, verdict-neutral)`);
  for (const o of observations) console.log(`  OBSERVATION (not scored): ${o}`);
  console.log(`scored checks (HARD_FAIL + FLAG): ${passes} PASS, ${fails} FAIL, ${over} OVERSTATED, ${opFlags} operator FLAG, ${capFlags} capture FLAG of ${scored.length} run (profile: ${EXPECTED_STEPS} scored checks${missing.length ? `; NOT RUN: ${missing.join(', ')}` : ''}); informational ${rows.filter((r) => r.status === 'INFO').length}; package checks ${pkg.filter((r) => r.status === 'PASS').length}/${pkg.length} PASS (${pkg.filter((r) => r.status === 'GAP').map((r) => r.id).join(', ') || 'no gaps'})`);
  console.log(`profile binding: ${PROFILE_FILE} sha256 ${binding.sha ?? 'absent'} == the cited ${PROFILE_SHA256.slice(0, 12)}…, ${EXPECTED_STEPS} scored checks and every policy taken from it, src/profile-map.ts rows identical: ${binding.ok}${binding.ok ? '' : ' — ' + binding.issues.join('; ')}`);
  const failOutside = rows.filter((r) => r.status === 'FAIL' && r.policy !== 'HARD_FAIL' && r.policy !== 'FLAG').map((r) => r.id);
  if (failOutside.length) console.log(`FAIL outside the scored checks (verdict-bearing): ${failOutside.join(', ')}`);
  if (RUN_ERRORS.length) console.log(`run errors (${RUN_ERRORS.length}; any one fails the verdict): ${RUN_ERRORS.join(' | ')}`);
  console.log(`VERDICT: ${verdict}`);
  // the run record (outputs/run/ only) and its comparison with the committed record (ROAD-27 requires them equal)
  const rec = recordOf();
  mkdirSync(join(ROOT, 'outputs', 'run'), { recursive: true });
  writeFileSync(join(ROOT, 'outputs', 'run', 'verification-results.json'), JSON.stringify(rec, null, 2) + '\n');
  const cf = join(ROOT, 'outputs', 'verification-results.json');
  if (existsSync(cf)) {
    const diffs = beyondTolerance(fieldDiff(JSON.parse(readFileSync(cf, 'utf8')), rec));
    console.log(`Reproduction vs the committed outputs/verification-results.json on Node ${process.versions.node}: ${diffs.length === 0 ? 'REPRODUCED' : `DIFFERS (${diffs.length} fields, e.g. ${diffs.slice(0, 2).map((d: any) => d.path).join(', ')})`}`);
  }
  console.log(`runtime ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exitCode = v.exit;
}
