// ============================================================================
//  HouseBets House Games (new engine) — shared engine for the multi-step capture rigs
//  (mines · road · hilo)  ·  ProvablyFair.org  ·  written 2026-10-10.
//  REFERENCE COPY, published with the audit package (27 Oct 2026). Comments redacted for publication (names, quotes
//  and internal paths removed); the code is unchanged. No hash of this file was recorded at capture, so the as-run
//  copy is not identified; this copy is the file as it stands in the capture folder on 27 Oct 2026.
//
//  Design = the auditor's v3 single-bet capture, generalised from "bets" to "rounds":
//   - auth: the refresh-cookie mechanism of reference/hb-capture-lib.mjs (loadAuth / parseCurl / jwtBody).
//     The new bundles still call POST /_api/housegames/refresh with {apiUrl,intent,token,selectorToken}
//     (mines bundle: `fetch(REFRESH_ENDPOINT,{method:"POST",credentials:"include",...body:JSON.stringify({apiUrl:o,
//     intent:t,token:e,selectorToken:n})`) and send the access token as the `X-Token` header.
//   - pre-capture anchor (buildPreCapture), CSPRNG client seeds (csprngClientSeed), seed-after-commitment
//     witness (commitmentWitness / checkWitness), epochs closed by POST /change_seed recording oldServerSeed.
//   - journal (every request/response + every rotation, appended the moment it exists) + atomic checkpoint
//     + --resume. All writes go through writeJsonSafe / appendJsonlSafe (credential scan before every write).
//  The game scripts supply: the plan, playRound(), and how to finish an interrupted round.
//
//  --origin may ONLY point at 127.0.0.1/localhost (the offline mock). Anything else is refused unless it is
//  exactly https://www.housebets.com.
// ============================================================================
import { createHash, randomInt } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadAuth, jwtBody, ttl, csprngClientSeed, clientSeedSourceOf, CLIENT_SEED_SOURCE, CLIENT_SEED_FORMAT,
  scrub, writeJsonSafe, appendJsonlSafe, dig, commitOf, nextCommitOf, buildPreCapture,
  commitmentWitness, checkWitness, drawnAtOf,
} from './reference/hb-capture-lib.mjs';

export { csprngClientSeed, CLIENT_SEED_SOURCE, CLIENT_SEED_FORMAT, scrub, dig, writeJsonSafe, appendJsonlSafe };
export const LIVE_ORIGIN = 'https://www.housebets.com';
export const sha256Hex = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
export const now = () => new Date().toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── argv ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv = process.argv.slice(2)) {
  const flag = (n, d) => { const h = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (!h) return d; const i = h.indexOf('='); return i === -1 ? true : h.slice(i + 1); };
  return { flag };
}
export function checkOrigin(origin) {
  if (origin === LIVE_ORIGIN) return origin;
  let u; try { u = new URL(origin); } catch { throw new Error(`--origin ${origin} is not a URL`); }
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.protocol !== 'http:') throw new Error(`--origin ${origin} refused: only ${LIVE_ORIGIN} or a local http://127.0.0.1 mock`);
  return origin.replace(/\/+$/, '');
}

// ── supplementary phases (Framework 1.0 · written 12 Oct 2026) ──
//  No phase flag → nothing below is used and the rig behaves exactly as before (plans, files, --resume, --check-open).
//    --plan=auto1 (= --phase=A)  primary dataset: single-call k = 1 rounds, ~6,500 (--rounds=N, a multiple of 50)
//    --phase=C                    elevated stake 2.00 (= 100 × the base stake 0.02), high-win-chance config
//    --phase=D --client-seeds=s1,s2,…  one player-typed client seed per epoch, in order (anchor included)
//              [--empty-seed-control]  POST /change_seed with clientSeed "" before epoch 0, answer kept in meta
//    --phase=E                    multi-step rounds (MINES-15/17): depths, mine counts / difficulties, guess chains
//  Every phase: epochs of exactly 50 rounds, meta.phase, its own checkpoint/journal and output file name, no open round.
export const PHASE_EPOCH = 50;
export const BASE_STAKE = 0.02;
export const PHASE_C_STAKE = 2.00;   // 100 × BASE_STAKE
export const PLAYER_SET = 'player-set';
export const PLAYER_SET_SOURCE = 'player-set: typed by the player (--client-seeds), chosen before the capture; predictable; disclosed';
const PHASE_PLAN_NAME = { A: 'auto1', C: 'elevated', D: 'playerseeds', E: 'multistep' };
/** Returns null when no phase flag is given (default behaviour), else the phase settings. Throws on a contradiction. */
export function phaseSetup(flag) {
  const planF = flag('plan', null), phF = flag('phase', null);
  let phase = phF == null || phF === true ? null : String(phF).toUpperCase();
  if (planF === 'auto1') { if (phase && phase !== 'A') throw new Error(`--plan=auto1 is Phase A; --phase=${phF} contradicts it`); phase = 'A'; }
  if (phase == null) return null;
  if (!PHASE_PLAN_NAME[phase]) throw new Error(`--phase=${phF}: only A (= --plan=auto1), C, D or E`);
  if (planF != null && planF !== 'auto1') throw new Error(`--phase=${phase} has its own plan; drop --plan=${planF}`);
  if (flag('repeat', null) != null) throw new Error('--repeat does not apply to a phase plan (sizes are fixed multiples of 50)');
  if (flag('probe', false)) throw new Error('--probe takes no --phase');
  const re = flag('rotate-every', null);
  if (re != null && Number(re) !== PHASE_EPOCH) throw new Error(`--phase=${phase}: every epoch is exactly ${PHASE_EPOCH} rounds; --rotate-every=${re} refused`);
  const st = flag('stake', null);
  let stake = Number(st ?? BASE_STAKE);
  // 13 Oct: --stake=<x> >= 2.00 is accepted for Phase C; a stake other than 2.00 renames the
  // plan (elevated-<x>usd) so its files never collide with the 2.00 Phase C run.
  if (phase === 'C') { if (st != null && !(Math.round(Number(st) * 1e8) >= Math.round(PHASE_C_STAKE * 1e8) && Math.round(Number(st) * 1e8) === Number(st) * 1e8)) throw new Error(`--phase=C plays at ${PHASE_C_STAKE.toFixed(2)} (100 × ${BASE_STAKE}) or more, at most 8 decimals; --stake=${st} refused`); stake = st != null ? Number(st) : PHASE_C_STAKE; }
  if (!(stake > 0)) throw new Error(`--stake=${st} is not a stake`);
  const out = { phase, planName: phase === 'C' && stake !== PHASE_C_STAKE ? `elevated-${stake}usd` : PHASE_PLAN_NAME[phase], stake, rotateEvery: PHASE_EPOCH, detail: phase === 'E' ? 'round' : 'epoch', clientSeeds: null, emptySeedControl: false, rounds: null };
  const cs = flag('client-seeds', null), esc = flag('empty-seed-control', false);
  if (phase === 'D') {
    if (cs != null && cs !== true) {
      out.clientSeeds = String(cs).split(',');
      if (out.clientSeeds.some((s) => s === '')) throw new Error('--client-seeds: an empty entry (the empty seed is tested by --empty-seed-control, not as an epoch)');
      if (new Set(out.clientSeeds).size !== out.clientSeeds.length) throw new Error('--client-seeds: every epoch needs its own seed (duplicates refused)');
      if (out.clientSeeds.length < 2) throw new Error('--client-seeds: Phase D needs ≥ 2 distinct player-set seeds (MINES-06 floor)');
    } else if (!flag('resume', false)) throw new Error('--phase=D needs --client-seeds=s1,s2,… (one per epoch, used in order, the anchor included)');
    out.emptySeedControl = !!esc;
  } else if (cs != null || esc) throw new Error('--client-seeds / --empty-seed-control belong to --phase=D');
  const rn = flag('rounds', null);
  if (rn != null) {
    if (phase !== 'A') throw new Error('--rounds sets the Phase A total only');
    out.rounds = Number(rn);
    if (!(Number.isInteger(out.rounds) && out.rounds > 0 && out.rounds % PHASE_EPOCH === 0)) throw new Error(`--rounds=${rn}: a positive multiple of ${PHASE_EPOCH}`);
  }
  return out;
}
/** A round's last accepted answer says the server settled it (game.active === false after an accepted bet). */
export function settledOnServer(reqs) {
  const ok = (reqs || []).filter((q) => q.status === 200 && q.response);
  return ok.some((q) => String(q.path).endsWith('/bet')) && ok.length > 0 && dig(ok[ok.length - 1].response, 'game.active') === false;
}

// ── CSPRNG decisions (never Math.random) ─────────────────────────────────────
export const DECISION_SOURCE = 'node:crypto randomInt';
export const rint = (lo, hiExcl) => randomInt(lo, hiExcl);
export const pick = (arr) => arr[randomInt(arr.length)];
export function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── HTTP client (refresh-cookie auth; origin overridable for the mock only) ──
/**
 * Every call returns { status, json } and NEVER throws on a 4xx when opts.allowFail is set (negative tests);
 * otherwise a non-200 throws an Error carrying .status and a scrubbed .json. 429 → back off, retry (max 8).
 * Response headers are never kept. The x-token lives only in this closure.
 */
export function makeClient(auth, { origin, game, log = () => {} }) {
  let token = null, userId = null;
  const base = () => ({ accept: 'application/json', 'user-agent': auth.ua, origin, referer: `${origin}/games/housegames-${game}`, cookie: auth.cookie });
  async function refresh() {
    const r = await fetch(`${origin}/_api/housegames/refresh`, { method: 'POST', headers: { ...base(), 'content-type': 'application/json' },
      body: JSON.stringify({ apiUrl: `${origin}/housegames`, intent: 'refresh', token: auth.refreshJwt, selectorToken: auth.refreshJwt }) });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(`refresh non-JSON ${r.status}`); }
    if (r.status !== 200 || !j.token) throw new Error(`refresh ${r.status} — re-grab refresh.curl (cookie may be stale)`);
    token = j.token; userId = jwtBody(token).id ?? null;
    return true;
  }
  const ensure = async () => { if (!token || ttl(token) < 60) await refresh(); };
  async function call(method, path, body, opts = {}) {
    for (let attempt = 0; ; attempt++) {
      await ensure();
      const r = await fetch(`${origin}/housegames${path}`, { method, headers: { ...base(), 'content-type': 'application/json', 'x-token': token }, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = { _nonJson: scrub(t.slice(0, 200)) }; }
      if (r.status === 429 && attempt < 8) { const wait = 1000 * (attempt + 1); log(`  429 on ${method} ${path} — backing off ${wait} ms`); await sleep(wait); continue; }
      if (r.status === 401 && attempt === 0) { token = null; continue; }
      if (r.status !== 200 && !opts.allowFail) { const e = new Error(`${method} ${path} ${r.status}: ${JSON.stringify(scrub(j)).slice(0, 200)}`); e.status = r.status; e.json = scrub(j); throw e; }
      return { status: r.status, json: scrub(j) };
    }
  }
  return {
    refresh, get userId() { return userId; }, get tokenTtl() { return token ? ttl(token) : 0; },
    get: (p, o) => call('GET', p, null, o), post: (p, b, o) => call('POST', p, b, o),
    seedsRaw: async (slug) => (await call('GET', `/seeds?gameType=${slug}`)).json,
    rotate: async (slug, clientSeed) => (await call('POST', '/change_seed', { gameType: slug, clientSeed })).json,
  };
}

// ── the capture engine ───────────────────────────────────────────────────────
/**
 * cfg: { game, apiSlug, fairnessSlug, schema, scriptFile, scriptSha, outDir, seedPrefix, rotateEvery, flag, log }
 * The dataset: { meta, preCapture, seeds[], rounds[] }. A round is bound to the pair whose hashedServerSeed was
 * read by GET /seeds immediately before the round started (round.pre). Rotation only happens between rounds.
 */
export function makeEngine(cfg) {
  const { game, apiSlug, outDir } = cfg;
  const cs = parseArgs().flag('crash-settled', null), CRASH_SETTLED = cs == null || cs === true ? null : Number(cs);   // test-only (phase runs)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const tag = cfg.phase ? `${game}-phase${cfg.phase}` : game;   // a phase never shares the default run's checkpoint
  const CHECKPOINT = join(outDir, `${tag}-checkpoint.json`), JOURNAL = join(outDir, `${tag}-journal.jsonl`);
  const say = cfg.log;
  const ds = {
    meta: {
      platform: 'housebets.com', game, apiSlug, fairnessSlug: cfg.fairnessSlug, schema: cfg.schema, createdAt: now(),
      ...(cfg.phase ? { phase: cfg.phase } : {}),
      origin: cfg.origin, captureScript: { file: cfg.scriptFile, sha256: cfg.scriptSha },
      clientSeedGenerator: { source: CLIENT_SEED_SOURCE, format: CLIENT_SEED_FORMAT, csprng: true, prefix: cfg.seedPrefix },
      decisionGenerator: `${DECISION_SOURCE} (plan drawn up front and stored in meta.plan; in-round choices drawn at play time and stored on the round)`,
      epochSize: cfg.rotateEvery, clientSeedLog: [], commitmentWitnesses: {},
    },
    preCapture: null, seeds: [], rounds: [],
  };
  const E = {
    ds, CHECKPOINT, JOURNAL,
    save() { ds.meta.savedAt = now(); writeJsonSafe(CHECKPOINT, ds); },
    journal(obj) { if (!cfg.probe) appendJsonlSafe(JOURNAL, obj); },
    seedLog: () => ds.meta.clientSeedLog,
    /** Load checkpoint + replay journal past it. Returns partial request logs of rounds that never completed. */
    load() {
      if (!existsSync(CHECKPOINT)) throw new Error(`--resume: no ${CHECKPOINT}`);
      const saved = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
      Object.assign(ds, saved);
      const partial = {};   // planIdx → [req log entries] for rounds not yet in ds.rounds
      let rr = 0, rot = 0;
      if (existsSync(JOURNAL)) {
        for (const line of readFileSync(JOURNAL, 'utf8').split('\n')) {
          if (!line.trim()) continue; let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.type === 'round' && j.rec.idx === ds.rounds.length) { ds.rounds.push(j.rec); delete partial[j.rec.planIdx]; rr++; }
          else if (j.type === 'rotation' && j.epoch === ds.seeds.length) { E.finishPair(j); rot++; }
          else if (j.type === 'req' && !ds.rounds.some((r) => r.planIdx === j.planIdx)) (partial[j.planIdx] ??= { pre: j.pre ?? null, reqs: [] }).reqs.push(j.req);
          else if (j.type === 'roundStart' && !ds.rounds.some((r) => r.planIdx === j.planIdx)) (partial[j.planIdx] ??= { pre: j.pre, reqs: [] }).pre = j.pre;
        }
      }
      say(`resumed: ${ds.rounds.length} rounds (${rr} from journal), ${ds.seeds.length} epochs (${rot} finished from journaled rotations), ${Object.keys(partial).length} interrupted round(s)`);
      return partial;
    },
    async pair(hb) { const s = (await hb.seedsRaw(apiSlug)).seed; s._readAt = now(); return s; },
    /** Phase D: log a player-typed client seed (no generatedAt: it was chosen before any hash was read). */
    playerSeed(seed, forEpoch) {
      if (!E.seedLog().some((e) => e.clientSeed === seed && String(e.source).startsWith(PLAYER_SET)))
        E.seedLog().push({ clientSeed: seed, prefix: null, source: PLAYER_SET_SOURCE, generatedAt: null, chosenBeforeCapture: true, forEpoch, submittedAt: now() });
      return seed;
    },
    async anchor(hb, playerSet) {   // playerSet: Phase D's first typed seed; undefined = a CSPRNG seed (default)
      const recordedAt = now();
      const rawSeedsBefore = await hb.seedsRaw(apiSlug); const beforeReadAt = now();
      const before = rawSeedsBefore.seed;
      if (nextCommitOf(before) == null) say('  ⚠ GET /seeds exposed no hashedNextServerSeed before epoch 0 — anchor stays null (not filled in)');
      const clientSeedUsed = playerSet != null ? E.playerSeed(playerSet, 0) : csprngClientSeed(cfg.seedPrefix + 'start', E.seedLog());
      const { oldServerSeed, seed: rotateResponseSeed } = await hb.rotate(apiSlug, clientSeedUsed);
      const after = await E.pair(hb);
      ds.meta.commitmentWitnesses[after.id] = commitmentWitness({ committedHash: nextCommitOf(before), source: 'preCapture.hashedNextServerSeed (read before the draw)', readAt: beforeReadAt, clientSeed: clientSeedUsed, clientSeedDrawnAt: drawnAtOf(E.seedLog(), clientSeedUsed) });
      ds.preCapture = buildPreCapture({ before, rawSeedsBefore, recordedAt, oldServerSeed, commitVerified: oldServerSeed ? sha256Hex(oldServerSeed) === commitOf(before) : null,
        after, rotateResponseSeed, clientSeedUsed, clientSeedSource: playerSet != null ? PLAYER_SET_SOURCE : CLIENT_SEED_SOURCE });
      const pc = ds.preCapture;
      say(`  pre-capture: pair ${pc.seedId} → epoch 0 pair ${pc.epoch0SeedId}  anchor ${pc.anchorOk === true ? 'OK' : pc.anchorOk === false ? 'MISMATCH' : 'n/a'}  reveal-commit ${pc.commitVerified ? 'OK' : String(pc.commitVerified)}`);
      return after;
    },
    async closePair(hb, pair, playerSet) {   // playerSet: Phase D's typed seed for the next epoch; undefined = CSPRNG (default)
      let serverNonceAtRotation = null, publishedNext = pair.hashedNextServerSeed ?? null, readAt = null;
      try { const cur = await E.pair(hb); readAt = now(); serverNonceAtRotation = cur.nonce ?? null; if (cur.id === pair.id && nextCommitOf(cur)) publishedNext = nextCommitOf(cur); } catch {}
      if (!readAt) readAt = pair._readAt ?? null;
      const nextSeed = playerSet != null ? E.playerSeed(playerSet, ds.seeds.length + 1) : csprngClientSeed(cfg.seedPrefix, E.seedLog());
      const { oldServerSeed, seed: next } = await hb.rotate(apiSlug, nextSeed);
      const rot = { type: 'rotation', at: now(), epoch: ds.seeds.length,
        pair: { id: pair.id, clientSeed: pair.clientSeed, hashedServerSeed: pair.hashedServerSeed, hashedNextServerSeed: pair.hashedNextServerSeed ?? null, nonce: pair.nonce ?? null },
        nextClientSeed: nextSeed, seedLogEntry: E.seedLog().find((e) => e.clientSeed === nextSeed) || null, oldServerSeed, next: scrub(next), serverNonceAtRotation,
        witnessForNext: commitmentWitness({ committedHash: publishedNext, source: `epoch ${ds.seeds.length} hashedNextServerSeed (read before the draw)`, readAt, clientSeed: nextSeed, clientSeedDrawnAt: drawnAtOf(E.seedLog(), nextSeed) }) };
      E.journal(rot);   // FIRST thing after the response: the revealed seed is never lost
      return E.finishPair(rot);
    },
    finishPair(rot) {
      const { pair, oldServerSeed, serverNonceAtRotation } = rot;
      const next = { ...rot.next, _readAt: now() };
      ds.meta.commitmentWitnesses[next.id] = rot.witnessForNext;
      if (rot.seedLogEntry && !E.seedLog().some((e) => e.clientSeed === rot.seedLogEntry.clientSeed)) E.seedLog().push(rot.seedLogEntry);
      const commitOk = oldServerSeed ? sha256Hex(oldServerSeed) === pair.hashedServerSeed : false;
      const chainLinkOk = pair.hashedNextServerSeed ? pair.hashedNextServerSeed === commitOf(next) : null;
      const mine = ds.rounds.filter((r) => r.pre && r.pre.hashedServerSeed === pair.hashedServerSeed);
      const witness = checkWitness(ds.meta.commitmentWitnesses[pair.id], pair.hashedServerSeed);
      ds.seeds.push({
        seedId: pair.id, epoch: ds.seeds.length, clientSeed: pair.clientSeed, clientSeedSource: clientSeedSourceOf(E.seedLog(), pair.clientSeed),
        hashedServerSeed: pair.hashedServerSeed, hashedNextServerSeed: pair.hashedNextServerSeed ?? null, revealedServerSeed: oldServerSeed ?? null,
        nonceStart: pair.nonce ?? null, serverNonceAtRotation, rotatedAt: rot.at, nextClientSeed: rot.nextClientSeed,
        clientSeedDrawnAfterCommitment: witness, commitmentValid: commitOk, chainLinkOk, rounds: mine.length,
      });
      say(`  ↻ pair ${pair.id} commit ${commitOk ? 'OK' : 'FAIL'} chain ${chainLinkOk == null ? 'n/a' : chainLinkOk ? 'OK' : 'FAIL'} rounds ${mine.length} server-nonce ${serverNonceAtRotation} → ${next.id}`);
      if (!commitOk || chainLinkOk === false || witness.equalsEpochHash === false || witness.readBeforeDraw === false) say(`  ⚠ INTEGRITY at pair ${pair.id}: commit=${commitOk} chain=${chainLinkOk} seedDrawnAfterCommitment=${witness.equalsEpochHash}/${witness.readBeforeDraw}`);
      return next;
    },
    /** A request inside a round: performed, journaled immediately, appended to the round's log. */
    async req(hb, round, method, path, body, opts = {}) {
      const at = now(); let res;
      try { res = method === 'GET' ? await hb.get(path, opts) : await hb.post(path, body, opts); }
      catch (e) { const entry = { at, method, path, body: scrub(body ?? null), status: e.status ?? null, error: String(e.message).slice(0, 200), response: e.json ?? null };
        round.requests.push(entry); E.journal({ type: 'req', planIdx: round.planIdx, req: entry }); throw e; }
      const entry = { at, method, path, body: scrub(body ?? null), status: res.status, response: res.json, ...(opts.negative ? { negativeTest: opts.negative } : {}) };
      round.requests.push(entry); E.journal({ type: 'req', planIdx: round.planIdx, req: entry });
      // test-only: die right after a journaled POST that left the round OPEN on the server (first such round at/after plan #crashMid)
      if (cfg.crashMid != null && round.planIdx >= cfg.crashMid && method === 'POST' && cfg.activeOf && cfg.activeOf(res.json)) { say(`  [test] --crash-mid: exiting abruptly with plan #${round.planIdx} open on the server`); process.exit(137); }
      // test-only, phase runs only: die right after a journaled POST that SETTLED the round, before the round is recorded
      if (cfg.ph && CRASH_SETTLED != null && round.planIdx >= CRASH_SETTLED && method === 'POST' && dig(res.json, 'game.active') === false) { say(`  [test] --crash-settled: exiting abruptly after plan #${round.planIdx} settled on the server, before it was recorded`); process.exit(137); }
      return res;
    },
    async startRound(hb, planIdx, spec, phase) {
      const p = await E.pair(hb);
      const pre = { at: now(), seedId: p.id ?? null, clientSeed: p.clientSeed ?? null, hashedServerSeed: commitOf(p), hashedNextServerSeed: nextCommitOf(p), nonceBefore: p.nonce ?? null };
      E.journal({ type: 'roundStart', planIdx, pre });
      return { idx: null, planIdx, phase, spec, pre, startedAt: now(), requests: [], decisions: [], detail: null };
    },
    finishRound(round) {
      round.idx = ds.rounds.length; round.endedAt = now();
      ds.rounds.push(round); E.journal({ type: 'round', rec: round });
      if (cfg.crashAfter != null && ds.rounds.length === cfg.crashAfter) { say(`  [test] --crash-after=${cfg.crashAfter}: exiting abruptly (no checkpoint)`); process.exit(137); }
    },
    summary() {
      const s = ds.seeds;
      return { epochs: s.length, rounds: ds.rounds.length,
        csprngEpochs: s.filter((x) => x.clientSeedSource === CLIENT_SEED_SOURCE).length,
        commitAll: s.every((x) => x.commitmentValid), chainAll: s.every((x) => x.chainLinkOk !== false),
        // a player-set (Phase D) seed was typed before the capture: the drawn-after-commitment witness does not apply to it
        //   (null, not a vacuous true, when every epoch is player-set; a default run has no player-set epoch: unchanged)
        witnessAll: s.length && s.every((x) => String(x.clientSeedSource).startsWith(PLAYER_SET)) ? null
          : s.filter((x) => !String(x.clientSeedSource).startsWith(PLAYER_SET)).every((x) => x.clientSeedDrawnAfterCommitment && x.clientSeedDrawnAfterCommitment.equalsEpochHash === true && x.clientSeedDrawnAfterCommitment.readBeforeDraw !== false),
        playerSetEpochs: s.filter((x) => String(x.clientSeedSource).startsWith(PLAYER_SET)).length,
        anchor: ds.preCapture ? ds.preCapture.anchorOk : null };
    },
  };
  return E;
}

/**
 * The common main loop. g = { plan(), playRound(hb,E,round), finishInterrupted(hb,E,round), roundDone(round)->bool,
 *   label(round), afterRound(hb,E,round) (detail fetch), openRound(hb,E,round) for --leave-open,
 *   phasePlan(PH, {staticReads, stake, log}) -> {plan, info} for a phase run (cfg.ph set) }.
 */
export async function runCapture(cfg, g) {
  const { flag } = parseArgs();
  const say = cfg.log;
  const E = makeEngine(cfg);
  const auth = loadAuth(cfg.curl);
  const hb = makeClient(auth, { origin: cfg.origin, game: cfg.apiSlug, log: say });
  await hb.refresh();
  say(`token ok — ttl ${hb.tokenTtl}s · origin ${cfg.origin}`);

  if (flag('check-open', false)) return checkOpen(cfg, g, hb);

  const PH = cfg.ph || null;   // null = default run: every `PH` branch below is skipped
  let partial = {};
  if (cfg.resume) partial = E.load();
  else if (existsSync(E.CHECKPOINT) || existsSync(E.JOURNAL)) throw new Error(`${E.CHECKPOINT} or its journal exists — use --resume, or move both aside`);

  if (!cfg.resume && PH) {
    // static reads first: the phase plan leaves out a config the max-win cap forbids at its first step (mines)
    E.ds.meta.staticReads = {};
    for (const p of g.staticPaths) { try { E.ds.meta.staticReads[p] = (await hb.get(p)).json; } catch (e) { E.ds.meta.staticReads[p] = { error: String(e.message).slice(0, 200) }; } }
    const built = g.phasePlan(PH, { staticReads: E.ds.meta.staticReads, stake: cfg.stake, log: say });
    if (!built.plan.length || built.plan.length % PHASE_EPOCH) throw new Error(`phase ${PH.phase} plan has ${built.plan.length} rounds: not a positive multiple of ${PHASE_EPOCH}`);
    E.ds.meta.plan = built.plan;
    E.ds.meta.planName = cfg.planName;
    E.ds.meta.noOpenRound = true;   // the 24 h left-open round belongs to the default run only
    E.ds.meta.phasePlan = { phase: PH.phase, planName: cfg.planName, rounds: built.plan.length, epochs: built.plan.length / PHASE_EPOCH, epochSize: PHASE_EPOCH,
      stake: cfg.stake, detailLookups: PH.detail === 'round' ? 'every round' : 'the first round of every epoch',
      ...(PH.phase === 'D' ? { clientSeeds: PH.clientSeeds, emptySeedControlRequested: PH.emptySeedControl } : {}), ...built.info };
  } else if (!cfg.resume) {
    // --repeat=N (full captures, 12 Oct): N independent draws of the plan, shuffled together; the left-open 24 h round
    // (kind 'open') is kept once at the end, or dropped with --no-open
    const REPEAT = Math.max(1, Number(flag('repeat', 1)) || 1);
    let P = [];
    for (let k = 0; k < REPEAT; k++) P.push(...g.plan().filter((x) => x.kind !== 'open'));
    if (REPEAT > 1) P = shuffle(P);
    const openE = flag('no-open', false) ? null : g.plan().find((x) => x.kind === 'open');
    if (openE) P.push(openE);
    E.ds.meta.plan = P;
    if (REPEAT > 1) E.ds.meta.planRepeat = REPEAT;
    if (flag('no-open', false)) E.ds.meta.noOpenRound = true;
    E.ds.meta.planName = cfg.planName;
    // static reads the client makes on load (raw, scrubbed): limits, published spec, payout table
    E.ds.meta.staticReads = {};
    for (const p of g.staticPaths) { try { E.ds.meta.staticReads[p] = (await hb.get(p)).json; } catch (e) { E.ds.meta.staticReads[p] = { error: String(e.message).slice(0, 200) }; } }
  }
  const plan = E.ds.meta.plan;
  if (PH && E.ds.meta.phase !== PH.phase) throw new Error(`checkpoint is phase ${E.ds.meta.phase}, not ${PH.phase}`);
  // Phase D: the typed seeds are part of the plan; a resume uses the stored ones
  const seedsD = PH && PH.phase === 'D' ? (E.ds.meta.phasePlan || {}).clientSeeds : null;
  if (PH && PH.phase === 'D') {
    if (!Array.isArray(seedsD) || seedsD.length < 2) throw new Error('phase D checkpoint holds no client seeds');
    if (PH.clientSeeds && JSON.stringify(PH.clientSeeds) !== JSON.stringify(seedsD)) throw new Error(`--client-seeds differ from the checkpoint's ${JSON.stringify(seedsD)}`);
  }
  const seedFor = (epoch) => (seedsD && epoch < seedsD.length ? seedsD[epoch] : undefined);   // past the last typed seed: CSPRNG
  say(`plan "${E.ds.meta.planName}": ${plan.length} rounds · stake ${cfg.stake} · epochs of ${cfg.rotateEvery} rounds · Σ min-stake ${(plan.reduce((s, x) => s + (x.stakeUnits ?? 1), 0) * cfg.stake).toFixed(2)}`);
  if (PH) say(`phase ${PH.phase}: ${plan.length / PHASE_EPOCH} epochs × ${PHASE_EPOCH} · detail lookups on ${E.ds.meta.phasePlan.detailLookups}${seedsD ? ` · player-set seeds ${JSON.stringify(seedsD)}` : ''}`);

  let pair;
  if (!E.ds.preCapture) {
    if (PH) {   // before the first state-changing request: a phase run never rotates under, or finishes, a round it did not start
      const open0 = await g.activeRound(hb);
      if (open0) throw new Error(`a ${cfg.game} round is open on the server (roundId ${g.roundKey(open0)}): a phase run never touches a round it did not start (the default run's 24 h round is closed by --check-open). Nothing was sent.`);
    }
    if (PH && PH.phase === 'D' && E.ds.meta.phasePlan.emptySeedControlRequested && !E.ds.meta.emptySeedControl) await emptySeedControl(cfg, E, hb);
    pair = await E.anchor(hb, seedFor(0)); E.save();
  }
  else pair = await E.pair(hb);

  // finish any round the previous process left open on the server
  const active = await g.activeRound(hb);
  if (active) {
    // which plan entry is open on the server: the partial whose journaled ACCEPTED responses carry the open round's id.
    // (12 Oct live: a refused bet's 409 answer also carries the open game, and matched the wrong plan entry.)
    const key = g.roundKey(active);
    let planIdx = Number(Object.keys(partial).find((k) => partial[k].reqs.some((q) => q.status === 200 && q.response && g.roundKey(q.response) === key)) ?? -1);
    if (planIdx < 0 && PH) throw new Error(`the open round (${key}) is not one this phase run started: left untouched (the default run's 24 h round is closed by --check-open). Nothing was sent.`);
    if (planIdx < 0) say(`  ⚠ the open round (${key}) matches no journaled round — finishing it as an unplanned round`);
    const spec = planIdx >= 0 ? plan[planIdx] : { kind: 'unplanned' };
    const round = { idx: null, planIdx, phase: 'RESUMED', spec, pre: partial[planIdx]?.pre ?? null, startedAt: null, requests: partial[planIdx]?.reqs ?? [], decisions: [], detail: null, resumedFinish: true, activeAtResume: active };
    delete partial[planIdx];
    say(`  open round found at resume (plan #${planIdx}) — finishing it (${spec.kind})`);
    await g.finishInterrupted(hb, E, round);
    await g.afterRound(hb, E, round);
    E.finishRound(round); E.save();
  }
  if (PH) {
    // a phase keeps a round the server SETTLED before the interruption (its answers are in the journal): replaying the
    // plan entry instead would leave that round's nonce out of the dataset and break "every epoch exactly 50"
    for (const k of Object.keys(partial).map(Number).sort((a, b) => a - b)) {
      if (k < 0 || !settledOnServer(partial[k].reqs)) continue;
      const reqs = partial[k].reqs, betq = reqs.find((q) => q.status === 200 && String(q.path).endsWith('/bet'));
      const round = { idx: null, planIdx: k, phase: plan[k].phase, spec: plan[k], pre: partial[k].pre ?? null, startedAt: null, requests: reqs, decisions: [], detail: null,
        recoveredFromJournal: true, roundId: g.roundKey(betq.response), generation: betq.body?.generation ?? null, outcome: 'settled on the server before the interruption; recovered from the journal' };
      delete partial[k];
      if (PH.detail === 'round') await g.afterRound(hb, E, round);
      E.finishRound(round);
      say(`  plan #${k}: settled before the interruption — recovered from the journal (not replayed)`);
    }
    E.save();
  }
  if (Object.keys(partial).length) {
    (E.ds.meta.lostRounds ??= []).push({ at: now(), planIdx: Object.keys(partial).map(Number), note: 'requests journaled for a plan entry that is not open on the server and never completed in the journal (e.g. a refused bet); the log is kept here and the plan entry is played again', partial: scrub(partial) });
    say(`  ⚠ ${Object.keys(partial).length} journaled-but-incomplete plan entr(y/ies) with no open server round — recorded in meta.lostRounds, replayed`);
    E.save();
  }

  const done = new Set(E.ds.rounds.map((r) => r.planIdx));
  let onPair = E.ds.rounds.filter((r) => r.pre && r.pre.hashedServerSeed === pair.hashedServerSeed && !(PH && r.skipped)).length;
  process.on('SIGINT', () => { console.log('\ninterrupted — saving…'); E.save(); console.log(`saved ${E.ds.rounds.length} rounds. Re-run with --resume.`); process.exit(0); });
  let errors = 0;
  for (let i = 0; i < plan.length; i++) {
    if (done.has(i)) continue;
    if (plan[i].kind === 'open') continue;   // the open round is played after the final rotation
    if (onPair >= cfg.rotateEvery) { pair = await E.closePair(hb, pair, seedFor(E.ds.seeds.length + 1)); onPair = 0; E.save(); }
    let round = null;
    try {
      round = await E.startRound(hb, i, plan[i], plan[i].phase);
      if (round.pre.hashedServerSeed !== pair.hashedServerSeed) say(`  ⚠ pair changed under the capture: ${pair.id} → ${round.pre.seedId}`);
      await g.playRound(hb, E, round);
      if (!PH || PH.detail === 'round' || onPair === 0) await g.afterRound(hb, E, round);   // a phase run: once per epoch unless E
      E.finishRound(round); if (!(PH && round.skipped)) onPair++; errors = 0;
      say(`  #${round.idx} plan ${i} ${g.label(round)}`);
      if (E.ds.rounds.length % (PH ? 25 : 5) === 0) E.save();
      if (cfg.delay) await sleep(cfg.delay);
    } catch (err) {
      if (PH && round && round.idx != null) { say(`  plan ${i}: error after the round was recorded (${String(err.message).slice(0, 160)}) — not replayed`); E.save(); continue; }
      if (PH && round && round.idx == null && settledOnServer(round.requests)) {
        // the server settled this round before the error (e.g. the detail lookup failed): keep it, never replay it
        round.errorAfterSettle = String(err.message).slice(0, 200);
        if (!round.outcome) round.outcome = 'settled on the server; the rig erred after the answer';
        E.finishRound(round); onPair++; E.save();
        say(`  #${round.idx} plan ${i} kept (settled on the server) after an error: ${round.errorAfterSettle}`);
        continue;
      }
      errors++; say(`  ERROR plan ${i}: ${err.message} (${errors}/5)`); E.save();
      if (errors >= 5) { console.log('  too many errors — saved, exiting. Re-run --resume.'); process.exit(1); }
      const act = await g.activeRound(hb).catch(() => null);
      if (act) { say('  a round is open after the error — stopping; --resume finishes it'); E.save(); process.exit(1); }
      await sleep(1500); i--;
    }
  }
  if (onPair > 0) pair = await E.closePair(hb, pair, seedFor(E.ds.seeds.length + 1));
  E.ds.meta.postCapture = { at: now(), activePair: scrub(await E.pair(hb).catch(() => null)) };

  // the 24 h rule: one round left open after one safe step, on the fresh pair, checked later with --check-open
  const openIdx = plan.findIndex((p) => p.kind === 'open');
  if (openIdx >= 0 && !done.has(openIdx) && !E.ds.meta.leftOpen) {
    const first = await E.startRound(hb, openIdx, plan[openIdx], 'OPEN');
    const round = (await g.openRound(hb, E, first)) || first;   // a bust before the first safe step is recorded and retried
    E.ds.meta.leftOpen = { at: now(), planIdx: openIdx, round };
    say(`  left one round OPEN at ${E.ds.meta.leftOpen.at} — run --check-open after 24 h`);
  }
  const s = E.summary();
  Object.assign(E.ds.meta, { totalRounds: E.ds.rounds.length, epochs: s.epochs, commitmentAllValid: s.commitAll, chainAllValid: s.chainAll, seedDrawnAfterCommitmentAllValid: s.witnessAll, finishedAt: now() });
  E.save();
  const outFile = join(cfg.outDir, PH ? `housebets-${cfg.game}-phase${PH.phase}-${cfg.planName}-${E.ds.rounds.length}rounds.json` : `housebets-${cfg.game}-${cfg.planName}-${E.ds.rounds.length}rounds.json`);
  writeJsonSafe(outFile, E.ds);
  console.log(`\n── DONE ── ${E.ds.rounds.length} rounds · ${s.epochs} epochs · CSPRNG epochs ${s.csprngEpochs}/${s.epochs} · anchor ${s.anchor} · commit ${s.commitAll} · chain ${s.chainAll} · seed-after-commitment ${s.witnessAll}`);
  if (PH) console.log(`  phase ${PH.phase} · player-set epochs ${s.playerSetEpochs}/${s.epochs}${E.ds.meta.emptySeedControl ? ` · empty-seed control: HTTP ${E.ds.meta.emptySeedControl.status} (${E.ds.meta.emptySeedControl.accepted ? 'accepted' : 'refused'})` : ''}`);
  console.log(`  dataset → ${outFile}\n  verify:  python3 -I ${cfg.verifyScript} ${outFile}`);
  return outFile;
}

/** Phase D --empty-seed-control: before epoch 0, ask the server to rotate to the client seed "" and keep its answer.
 *  If it accepts, the rotation reveals the pair it closed (checked here and by the verifier) and the anchor then
 *  rotates away from the empty-seed pair; no round is ever played on it. */
async function emptySeedControl(cfg, E, hb) {
  const before = await E.pair(hb).catch(() => null);
  const body = { gameType: cfg.apiSlug, clientSeed: '' };
  const at = now();
  const r = await hb.post('/change_seed', body, { allowFail: true });
  const after = await E.pair(hb).catch(() => null);
  const old = dig(r.json, 'oldServerSeed');
  const rec = { at, request: { method: 'POST', path: '/change_seed', body }, status: r.status, accepted: r.status === 200, response: r.json,
    pairBefore: scrub(before), pairAfter: scrub(after), clientSeedAfter: after ? after.clientSeed ?? null : null,
    revealCommitOk: r.status === 200 && old ? sha256Hex(old) === commitOf(before) : null };
  E.journal({ type: 'emptySeedControl', rec });   // FIRST thing after the answer: a revealed seed is never lost
  E.ds.meta.emptySeedControl = rec; E.save();
  cfg.log(`  empty-seed control: POST /change_seed clientSeed "" → HTTP ${r.status} ${rec.accepted ? `ACCEPTED (pair now has clientSeed ${JSON.stringify(rec.clientSeedAfter)}, reveal-commit ${rec.revealCommitOk})` : `refused ${JSON.stringify(r.json).slice(0, 160)}`}`);
}

/** --check-open: after ≥ 24 h, read the left-open round's state; if the server finished it, rotate to reveal and append it. */
async function checkOpen(cfg, g, hb) {
  const E = makeEngine(cfg); E.load();
  const lo = E.ds.meta.leftOpen;
  if (!lo) throw new Error('no meta.leftOpen in the checkpoint');
  const hours = (Date.now() - Date.parse(lo.at)) / 3.6e6;
  const state = await g.activeRound(hb);
  const rec = { at: now(), hoursSinceLeft: Number(hours.toFixed(3)), stillActive: !!state, activeState: state ? scrub(state) : null };
  (E.ds.meta.openChecks ??= []).push(rec);
  console.log(`left open ${hours.toFixed(2)} h ago — server round still active: ${!!state}`);
  // --close-open (13 Oct): after >= 24 h with the server still holding the round active,
  // the auditor closes it with the round's own action (cash out if allowed, else the game's one safe step then cash out),
  // every request and answer recorded on the round; it is then revealed and appended exactly like a server-finished round,
  // marked closedByAuditor (never closedByServer) with the checks that found it still active.
  const CLOSE = Array.isArray(process.argv) && process.argv.includes('--close-open');
  if (state && !(CLOSE && hours >= 24)) { E.save(); console.log(hours < 24 ? 'not 24 h yet — run again later' : '⚠ still active after 24 h — recorded in meta.openChecks'); return; }
  const round = lo.round;
  if (state) {
    if (g.roundKey(state) !== round.roundId && round.roundId) throw new Error(`the active round ${g.roundKey(state)} is not the left-open round ${round.roundId}: nothing sent`);
    lo.closedBy = { by: 'auditor', at: now(), hoursSinceLeft: Number(hours.toFixed(3)), checks: E.ds.meta.openChecks.map((c) => ({ at: c.at, hoursSinceLeft: c.hoursSinceLeft, stillActive: c.stillActive })),
      why: 'the server still held the round active at every check after 24 h; closed with the round\'s own action so the game can be captured' };
    round.activeAtResume = state;
    await g.finishInterrupted(hb, E, round);
    console.log(`closed by the auditor after ${hours.toFixed(2)} h: ${round.outcome}`);
  }
  await g.afterRound(hb, E, round);   // detail lookup of the finished round
  const p = round.pre;   // the pair the open round was dealt on (read immediately before it started)
  if (state) round.closedByAuditor = true; else round.closedByServer = true;
  E.finishRound(round);
  await E.closePair(hb, { id: p.seedId, clientSeed: p.clientSeed, hashedServerSeed: p.hashedServerSeed, hashedNextServerSeed: p.hashedNextServerSeed, nonce: p.nonceBefore });
  E.save();
  const outFile = join(cfg.outDir, `housebets-${cfg.game}-${E.ds.meta.planName}-${E.ds.rounds.length}rounds-withopen.json`);
  writeJsonSafe(outFile, E.ds);
  console.log(`${state ? 'auditor closed' : 'server finished'} the open round; revealed and appended → ${outFile}`);
}
