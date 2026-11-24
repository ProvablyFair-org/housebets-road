#!/usr/bin/env node
/* ============================================================================
 *  HouseBets House Games (new engine) — CROSS THE ROAD ("Hubie's Road", slug road) capture · ProvablyFair.org
 *  REFERENCE COPY, published with the audit package (27 Oct 2026). Comments redacted for publication (names, quotes
 *  and internal paths removed); the code is unchanged. The as-run file (sha256 f7c1ed68f6144f72881ae360b2bb206a76790b11ced7157eca757fdd30f11ec7, recorded as
 *  meta.captureScript.sha256 in the five 13 Oct 2026 datasets of this package) is held privately; this copy is not that
 *  file. The 12 Oct 2026 file records the version of the script used that day (sha256 0c9661590f0af4f61498704030195612a892231cb81c8b43fd30de4ca168932c); that copy was not kept.
 *  The capture ran inside the logged-in browser tab, bundled with its node: imports replaced by browser shims;
 *  crypto-shim.reference.js is the crypto one (randomBytes = window.crypto.getRandomValues). The imports
 *  below name the capture folder's layout; multistep-common.reference.mjs and hb-capture-lib.reference.mjs are their
 *  reference copies.
 *
 *  API (from the game page's bundle platform-housegames-road-game.js, sha256 d9ba3797…):
 *    POST /housegames/road/bet     {generation,amount,difficulty,currency[,steps]}   (steps = auto mode: settles in one call)
 *    POST /housegames/road/action  {generation,roundId,seq,action:"step"|"cashout"}
 *    GET  /housegames/road/game    (open round)
 *    GET  /housegames/provably_fair/rounds/road/<roundId> → {gameRecordId} → GET /housegames/road/game_detail/<id>
 *    GET  /housegames/seeds?gameType=road · POST /housegames/change_seed {gameType:"road",clientSeed}
 *
 *  Run from this folder: same steps as the mines capture (refresh.curl from a launched Road tab, --probe, full, --resume,
 *  --check-open after 24 h).  Flags: --stake=0.02 --rotate-every=10 --delay=150 --plan=full|tiny --curl --origin(mock)
 *  Supplementary phases (written 12 Oct 2026; see multistep-common.mjs phaseSetup):
 *    --plan=auto1 [--rounds=6500]  Phase A: auto bets, steps = 1, the four difficulties equally
 *    --phase=C                     150 auto bets easy, steps = 1, at 2.00
 *    --phase=D --client-seeds=a,b,c,d [--empty-seed-control]   4 epochs × 50 auto bets (steps = 1) under typed seeds
 *    --phase=E                     600 manual rounds, 150 per difficulty, stop lanes 2..all lanes
 * ==========================================================================*/
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs, checkOrigin, LIVE_ORIGIN, runCapture, makeEngine, makeClient, rint, shuffle, pick, dig, now, writeJsonSafe, phaseSetup, PHASE_EPOCH } from '../multistep-common.mjs';
import { loadAuth } from '../reference/hb-capture-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { flag } = parseArgs();
let PH = null; try { PH = phaseSetup(flag); } catch (e) { console.error('FATAL:', e.message); process.exit(2); }   // null = default run
const STAKE = PH ? PH.stake : Number(flag('stake', 0.02));
const PLAN = PH ? PH.planName : String(flag('plan', 'full'));
const CURRENCY = 1;   // road client: currency = sn() = stored currency code, default 1
const LANES = { easy: 24, medium: 22, hard: 20, daredevil: 15 };   // bundle: vn=[{easy,traps:1,lanes:24},{medium,3,22},{hard,5,20},{daredevil,10,15}]
const cfg = {
  game: 'road', apiSlug: 'road', fairnessSlug: 'road', schema: 'housebets-road-newengine-capture-v1',
  scriptFile: 'rig/road/capture-hb-road.mjs', scriptSha: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  outDir: String(flag('outdir', join(HERE, 'outputs'))), seedPrefix: 'pfroad', rotateEvery: PH ? PH.rotateEvery : Number(flag('rotate-every', PLAN === 'tiny' ? 2 : 10)),
  origin: checkOrigin(String(flag('origin', LIVE_ORIGIN))), curl: String(flag('curl', join(HERE, 'refresh.curl'))),
  stake: STAKE, delay: Number(flag('delay', 150)), resume: !!flag('resume', false), probe: !!flag('probe', false), planName: PLAN,
  crashAfter: flag('crash-after', null) == null ? null : Number(flag('crash-after')), crashMid: flag('crash-mid', null) == null ? null : Number(flag('crash-mid')),
  verifyScript: 'verify-road.py', log: (m) => console.log(m), activeOf: (j) => dig(j, 'game.active') === true,
  ...(PH ? { phase: PH.phase, ph: PH } : {}),
};

// ── plan ─────────────────────────────────────────────────────────────────────
function plan() {
  const out = []; const add = (o) => out.push({ stakeUnits: 1, ...o });
  if (PLAN === 'tiny') {
    add({ phase: 'M', kind: 'manual', difficulty: 'easy', stopLane: rint(1, 25) });
    add({ phase: 'M', kind: 'manual', difficulty: 'daredevil', stopLane: 15 });
    add({ phase: 'A', kind: 'auto', difficulty: 'medium', steps: rint(1, 23) });
    add({ phase: 'A', kind: 'auto', difficulty: 'hard', steps: 1 });
    add({ phase: 'N', kind: 'negative', difficulty: 'easy', stopLane: 2 });
    return out;
  }
  for (const [d, L] of Object.entries(LANES)) {
    // stop lanes: 1,2,3, the quartiles, L-1, a full crossing twice, three CSPRNG lanes
    for (const s of [1, 2, 3, Math.floor(L / 4), Math.floor(L / 2), Math.floor((3 * L) / 4), L - 1, L, L, rint(1, L + 1), rint(1, L + 1), rint(1, L + 1)])
      add({ phase: 'M', kind: 'manual', difficulty: d, stopLane: s });
    for (const s of [1, Math.floor(L / 2), L, rint(1, L + 1)]) add({ phase: 'A', kind: 'auto', difficulty: d, steps: s });
  }
  add({ phase: 'N', kind: 'negative', difficulty: 'easy', stopLane: 2 });
  add({ phase: 'N', kind: 'negative', difficulty: 'hard', stopLane: 1 });
  const shuffled = shuffle(out);
  shuffled.push({ stakeUnits: 1, phase: 'O', kind: 'open', difficulty: 'easy', stopLane: 1 });
  return shuffled;
}

// ── phase plans (supplementary phases, written 12 Oct 2026) ──────────────────────────────────────────────────
const auto1 = (phase, difficulty) => ({ stakeUnits: 1, phase, kind: 'auto', difficulty, steps: 1 });
function phasePlan(PH, { log }) {
  const D = Object.keys(LANES);
  if (PH.phase === 'A') {
    // the four difficulties equally (a remainder, if --rounds is not a multiple of 4, goes to CSPRNG-chosen difficulties)
    const total = PH.rounds ?? 6500, n = D.map(() => Math.floor(total / D.length));
    for (const i of shuffle([...D.keys()]).slice(0, total - n.reduce((a, b) => a + b, 0))) n[i]++;
    const plan = shuffle(D.flatMap((d, i) => Array.from({ length: n[i] }, () => auto1('A', d))));
    log(`Phase A plan: ${plan.length} auto rounds (steps = 1) · ${D.map((d, i) => `${d} ${n[i]}`).join(' · ')} · ${plan.length / PHASE_EPOCH} epochs`);
    return { plan, info: { perDifficulty: Object.fromEntries(D.map((d, i) => [d, n[i]])), steps: 1 } };
  }
  if (PH.phase === 'C') return { plan: Array.from({ length: 150 }, () => auto1('C', 'easy')), info: { config: 'easy, auto steps = 1 (win chance 24/25)', winsFloor: 100 } };
  if (PH.phase === 'D') return { plan: Array.from({ length: PH.clientSeeds.length * PHASE_EPOCH }, () => auto1('D', pick(D))), info: { config: 'auto steps = 1; difficulty CSPRNG' } };
  // Phase E: 150 manual rounds per difficulty · E1 stop lane 2–3 ×40 · E2 4–8 ×50 · E3 CSPRNG 2..lanes ×50 · E4 every lane ×10
  const out = [];
  for (const [d, L] of Object.entries(LANES)) {
    const subs = [['E1', 40, () => rint(2, 4)], ['E2', 50, () => rint(4, Math.min(8, L) + 1)], ['E3', 50, () => rint(2, L + 1)], ['E4', 10, () => L]];
    for (const [sub, count, sf] of subs) for (let k = 0; k < count; k++) out.push({ stakeUnits: 1, phase: 'E', kind: 'manual', sub, difficulty: d, stopLane: sf() });
  }
  log(`Phase E plan: ${out.length} manual rounds · 150 per difficulty · stop lanes 2..all lanes`);
  return { plan: shuffle(out), info: { perDifficulty: 150, subPhases: 'E1 stop 2–3 ×40 · E2 stop 4–8 ×50 · E3 stop CSPRNG 2..lanes ×50 · E4 every lane ×10' } };
}

// ── one round ────────────────────────────────────────────────────────────────
const g = (j) => dig(j, 'game') || {};
async function bet(hb, E, round, steps) {
  round.generation = randomUUID();
  const body = { generation: round.generation, amount: STAKE, difficulty: round.spec.difficulty, currency: CURRENCY };
  if (steps != null) body.steps = steps;
  const r = await E.req(hb, round, 'POST', '/road/bet', body);
  round.roundId = g(r.json).roundId ?? null;
  return r.json;
}
// every action carries a FRESH generation: the server treats a repeated generation as a replay and answers
// with the cached state (12 Oct live: reveals with the bet's generation returned 200 with nothing opened)
const act = (hb, E, round, cur, action, opts) => E.req(hb, round, 'POST', '/road/action', { generation: randomUUID(), roundId: round.roundId, seq: g(cur).seq, action }, opts);

async function walk(hb, E, round, j, stopLane) {
  while (g(j).active === true && g(j).position < stopLane) {
    const o = g(j).options || {};
    if (!o.step) { round.decisions.push({ at: now(), why: o.maxWin ? 'max-win: step not offered' : 'step not offered', position: g(j).position, options: o }); round.maxWinStop = !!o.maxWin; break; }
    j = (await act(hb, E, round, j, 'step')).json;
  }
  if (g(j).active === true) j = (await act(hb, E, round, j, 'cashout')).json;
  return j;
}
async function playRound(hb, E, round) {
  const s = round.spec;
  let j;
  if (s.kind === 'auto') j = await bet(hb, E, round, s.steps);
  else {
    j = await bet(hb, E, round);
    if (s.kind === 'negative') {   // spec: cash-out allowed only after one safe step — try it at lane 0
      const neg = await act(hb, E, round, j, 'cashout', { allowFail: true, negative: 'cashout before any lane crossed' });
      round.negativeResult = { status: neg.status, refused: neg.status !== 200 };
      if (neg.status === 200) j = neg.json;
    }
    j = await walk(hb, E, round, j, s.stopLane);
  }
  round.outcome = g(j).active ? 'STILL ACTIVE' : `${g(j).outcome} at lane ${g(j).position}${g(j).hit ? ` (hit ${g(j).hit})` : ''}`;
}
async function activeRound(hb) { const r = await hb.get('/road/game', { allowFail: true }); return r.status === 200 && g(r.json).active === true ? r.json : null; }
async function finishInterrupted(hb, E, round) {
  const st = round.activeAtResume; round.roundId = g(st).roundId;
  round.generation = round.requests.find((q) => q.body?.generation)?.body.generation ?? randomUUID();
  let j = st;
  if (!(g(j).options || {}).cashout) j = (await act(hb, E, round, j, 'step')).json;
  if (g(j).active) j = (await act(hb, E, round, j, 'cashout')).json;
  round.outcome = `finished at resume: ${g(j).outcome} at lane ${g(j).position}`;
}
async function afterRound(hb, E, round) {
  if (!round.roundId) return;
  const a = await hb.get(`/provably_fair/rounds/road/${round.roundId}`, { allowFail: true });
  const rec = dig(a.json, 'gameRecordId', 'gameRecordID');
  round.detailLookup = { path: `/provably_fair/rounds/road/${round.roundId}`, status: a.status, response: a.json };
  if (rec == null) return;
  const d = await hb.get(`/road/game_detail/${rec}`, { allowFail: true });
  round.detail = { path: `/road/game_detail/${rec}`, status: d.status, response: d.json };
}
async function openRound(hb, E, round) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let j = await bet(hb, E, round);
    j = (await act(hb, E, round, j, 'step')).json;
    if (g(j).active) { round.outcome = 'left open after one safe lane'; return round; }
    round.outcome = 'trap before the open round could start'; await afterRound(hb, E, round); E.finishRound(round);
    round = await E.startRound(hb, round.planIdx, round.spec, 'OPEN-retry');
  }
  return round;
}
const label = (r) => `${r.spec.kind} ${r.spec.difficulty} ${r.spec.kind === 'auto' ? `steps=${r.spec.steps}` : `stop=${r.spec.stopLane}`} → ${r.outcome}`;
const G = { roundKey: (j) => dig(j, 'game.roundId') ?? null, plan, playRound, activeRound, finishInterrupted, afterRound, openRound, label, phasePlan, staticPaths: ['/limits/road', '/road/fairness'] };

async function probe() {
  const E = makeEngine(cfg); const auth = loadAuth(cfg.curl);
  const hb = makeClient(auth, { origin: cfg.origin, game: 'road', log: cfg.log }); await hb.refresh();
  E.ds.meta.planName = 'probe'; E.ds.meta.kind = 'probe';
  E.ds.meta.staticReads = {}; for (const p of G.staticPaths) { const r = await hb.get(p, { allowFail: true }); E.ds.meta.staticReads[p] = { status: r.status, json: r.json }; }
  let pair = await E.anchor(hb);
  const specs = [{ phase: 'P', kind: 'manual', difficulty: 'easy', stopLane: 2 }, { phase: 'P', kind: 'auto', difficulty: 'medium', steps: 1 }];
  E.ds.meta.plan = specs;
  for (let i = 0; i < specs.length; i++) { const round = await E.startRound(hb, i, specs[i], 'PROBE'); await playRound(hb, E, round); await afterRound(hb, E, round); E.finishRound(round); console.log(`  probe round ${i}: ${label(round)}`); }
  pair = await E.closePair(hb, pair);
  const file = join(cfg.outDir, `road-probe-${Date.now()}.json`); writeJsonSafe(file, E.ds);
  const first = E.ds.rounds[0].requests[0]?.response;
  console.log('\n── PROBE RESULT (fields observed, not judged) ──');
  console.log(`  bet response keys ${JSON.stringify(Object.keys(first || {}))} · game keys ${JSON.stringify(Object.keys(g(first)))} · fairness ${JSON.stringify(g(first).fairness || null)}`);
  console.log(`  detail lookup ${E.ds.rounds[0].detailLookup?.status} → detail ${E.ds.rounds[0].detail?.status}`);
  console.log(`  anchor ${E.ds.preCapture.anchorOk} · commit ${E.ds.seeds[0].commitmentValid} · chain ${E.ds.seeds[0].chainLinkOk} · witness ${E.ds.seeds[0].clientSeedDrawnAfterCommitment.equalsEpochHash}`);
  console.log(`  probe file → ${file}\n  next: python3 -I verify-road.py ${file}`);
}

(cfg.probe ? probe() : runCapture(cfg, G)).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
