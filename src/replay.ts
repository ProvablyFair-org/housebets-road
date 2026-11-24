// The per-round replay of HouseBets Hubie's Road, shared by every dataset (port of rig/road/verify-road.py's round loop, whose
// outputs it must agree with). Every check is made against the field DERIVED from the revealed seed; the operator's outcome
// label, trap lane, multiplier and payout are only compared, never used.
import { picks, firstDeadlyLane } from './rng.ts';
import { pay8, multDouble, allowed, units8 } from './rules.ts';
import { DIFFICULTIES, MAX_WIN, SLOTS } from './spec.ts';
import type { Dataset, Round, Seed, Game } from './types.ts';

export interface RoundResult {
  idx: number; ok: boolean; bad: string[];
  difficulty: string; traps: number; lanes: number; stake8: bigint; nonce: number; epochHash: string | null; epochIx: number;
  kind: string; outcome: string | null | undefined; k: number; payout8: bigint; won: boolean; slot0: number | null; firstDeadly: number | null;
  field: number[] | null; settledField: number[] | null; steps: number | null; capStops: number;
  rows: Record<string, [number, number]>;          // row name -> [ok, total], aggregated by the verifier into profile checks
  closedByServer: boolean; leftValue8: bigint | null; leftK: number;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const g200 = (q: any): Game | null => (q && q.status === 200 && q.response && typeof q.response === 'object' && q.response.game) ? q.response.game : null;

/** Replay one round. `byHash`: the dataset's epochs by server-seed hash (the epoch is the one the SERVER names in its answer). */
export function replayRound(r: Round, byHash: Map<string, { seed: Seed; ix: number }>): RoundResult {
  const rows: Record<string, [number, number]> = {};
  const bad: string[] = [];
  const row = (name: string, cond: boolean, detail = '') => { const a = rows[name] ||= [0, 0]; a[1]++; if (cond) a[0]++; else bad.push(`${name}: round ${r.idx} ${detail}`); };
  const res: RoundResult = { idx: r.idx, ok: false, bad, difficulty: '', traps: 0, lanes: 0, stake8: 0n, nonce: 0, epochHash: null, epochIx: -1, kind: String(r.spec?.kind),
    outcome: undefined, k: 0, payout8: 0n, won: false, slot0: null, firstDeadly: null, field: null, settledField: null, steps: null, capStops: 0, rows, closedByServer: !!r.closedByServer, leftValue8: null, leftK: 0 };
  const reqs = r.requests || [];
  // a negative test sends a cash-out with no lane crossed on purpose (12 Oct file): its refusal (HTTP 400, code 6) is the answer
  // the rules call for, the only refused request a round may hold
  const refusedOnPurpose = (q: any) => r.spec?.kind === 'negative' && q.status === 400 && q.path === '/road/action' && q.body?.action === 'cashout' && q.response?.code === 6;
  row('every request answered 200 (no refused or replayed request in the round)', reqs.every((q) => q.status === 200 || refusedOnPurpose(q)) && !(r.replays && (r.replays as unknown[]).length) && !r.skipped, `statuses ${reqs.map((q) => q.status)}`);
  const betq = reqs.find((q) => q.path === '/road/bet' && q.status === 200);
  if (!betq) { row('round has its bet', false); return res; }
  const bg = g200(betq)!;
  const h = bg?.fairness?.hashedServerSeed ?? null; res.epochHash = h;
  row("round's pair: the server's bet answer hash == the hash read before the round", !!h && h === r.pre?.hashedServerSeed, `${h} vs ${r.pre?.hashedServerSeed}`);
  const ep = h ? byHash.get(h) : undefined;
  if (!ep || !ep.seed.revealedServerSeed) { row('round is on a revealed epoch', false, `hash ${h}`); return res; }
  res.epochIx = ep.ix;
  const server = ep.seed.revealedServerSeed, client = ep.seed.clientSeed;
  const d = String(betq.body.difficulty); const dl = DIFFICULTIES[d];
  if (!dl) { row('difficulty is published', false, d); return res; }
  const [m, lanes] = dl; const stake8 = units8(betq.body.amount);
  res.difficulty = d; res.traps = m; res.lanes = lanes; res.stake8 = stake8;
  let final: any = [...reqs].reverse().find((q) => q.status === 200 && g200(q)?.active === false) ?? null;
  const det0 = r.detail?.response?.game ?? null;
  let srv = false;
  if (!final && r.closedByServer && det0 && det0.active === false) { final = { status: 200, response: r.detail!.response, path: 'game_detail' }; srv = true; }
  if (!final) { row('round settled', false); return res; }
  const G: Game = final.response.game; const fair = G.fairness || {};
  row('settled game difficulty / traps / lanes == the bet and the published table', G.difficulty === d && G.traps === m && G.lanes === lanes, `${G.difficulty}/${G.traps}/${G.lanes} vs ${d}/${m}/${lanes}`);
  row('fairness.version == canonical', fair.version === 'canonical', String(fair.version));
  row('fairness.hashedServerSeed == epoch hash', fair.hashedServerSeed === ep.seed.hashedServerSeed);
  row('fairness.clientSeed == epoch client seed', fair.clientSeed === client, `${fair.clientSeed} vs ${client}`);
  const expNonce = (r.pre?.nonceBefore ?? 0) + 1;
  const nonce = fair.nonce ?? expNonce; res.nonce = Number(nonce);
  row('fairness.nonce == server nonce before the round + 1', Number(fair.nonce) === expNonce, `${fair.nonce} vs ${expNonce}`);
  // The fairness block and round id the recompute uses (the settled answer's) == the one in EVERY other server answer of the
  // round (bet, each action, game_detail), and the capture's own copies (round id, the client seed and hash it read before
  // the round, its outcome label) == the server's. A forged answer anywhere in the round, with the copies left intact, fails.
  {
    const answers = [...reqs.map(g200), det0].filter((x): x is Game => !!x);
    const fb = (x: any) => JSON.stringify([x?.fairness?.version, x?.fairness?.hashedServerSeed, x?.fairness?.clientSeed]);
    row('server answers agree: every answer of the round carries the settled hash, client seed and version', answers.every((x) => fb(x) === fb(G)), `${answers.length} answers`);
    row('server answers agree: every answer of the round carries the settled nonce and round id', answers.every((x) => x.fairness?.nonce === fair.nonce && x.roundId === G.roundId), `${answers.map((x) => x.fairness?.nonce)}`);
    const lab = /^(?:finished at resume: )?(trap|cashout|castle) at lane (\d+)(?: \(hit (\d+)\))?$/.exec(String(r.outcome ?? ''));
    const labelOk = srv ? true : !!lab && lab[1] === G.outcome && Number(lab[2]) === (G.position ?? 0) && (G.outcome === 'trap' ? Number(lab[3]) === G.hit : lab[3] === undefined);
    row("capture copies == the server's answer: round id, the client seed and hash read before the round, outcome label", (r.roundId == null || r.roundId === G.roundId)
      && (r.pre?.clientSeed == null || r.pre.clientSeed === fair.clientSeed) && r.pre?.hashedServerSeed === fair.hashedServerSeed && labelOk, `${r.roundId} ${r.outcome} vs ${G.roundId} ${G.outcome}`);
  }
  // Every amount the server answers with is on the platform's 1e-8 grid (an off-grid value is never rounded onto it)
  {
    const onGrid = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && Number(v.toFixed(8)) === v) || (typeof v === 'string' && /^-?\d+(\.\d{1,8})?$/.test(v));
    const amounts: unknown[] = [betq.body.amount];
    for (const q of [...reqs, ...(r.detail ? [r.detail] : [])]) {
      if (q.status !== 200 || !q.response) continue; const x: any = q.response; const g: any = x.game;
      amounts.push(x.balance, x.round?.stake, x.round?.payout, x.round?.delta, x.round?.balance);
      if (g) amounts.push(g.stake, g.payout, g.value, g.maxWin, g.next?.value);
    }
    row('money on the 1e-8 grid: stake sent, and every stake, value, offer value, payout, max win, balance and round record served', amounts.every(onGrid), JSON.stringify(amounts.filter((v) => !onGrid(v))));
  }
  const field = picks(server, client, Number(nonce), m); const first = firstDeadlyLane(field, lanes);
  res.field = field; res.settledField = G.field ?? null; res.firstDeadly = first; res.slot0 = field[0];
  row('field (trap slots, in draw order) == derived', eq(G.field, field), `served ${JSON.stringify(G.field)} derived ${JSON.stringify(field)}`);
  row('trapLane == the first deadly lane derived (lane L deadly iff slot L − 1 is a trap)', (G.trapLane ?? null) === first, `${G.trapLane} vs ${first}`);
  const cap8 = units8((G.maxWin ?? MAX_WIN) as any);
  // ── replay every request against the derived field
  let pos = 0;
  for (const q of reqs) {
    const g = g200(q); if (!g) continue;
    if (g.active === true) {   // The offer the game shows before the next lane — its multiplier and value, and whether cash-out is offered
      const kk = g.position ?? 0; const nx: any = (g as any).next; const o: any = g.options || {};
      const where = q.path === '/road/bet' ? 'offer on the bet answer' : 'offer on a later answer';
      const nextOk = kk >= lanes ? nx == null : nx != null ? nx.multiplier === multDouble(SLOTS, m, kk + 1) && units8(nx.value) === pay8(stake8, SLOTS, m, kk + 1) : !o.step;
      row(`${where}: next.multiplier == the exact fraction at lane k + 1 (binary64), next.value == floor(stake × it), cash-out offered iff a lane is crossed`, nextOk && !!o.cashout === kk >= 1,
        `lane ${kk}: next ${JSON.stringify(nx)} vs ${multDouble(SLOTS, m, kk + 1)} / ${pay8(stake8, SLOTS, m, kk + 1)}; options ${JSON.stringify(o)}`);
    }
    if (g.active === true && (g.position ?? 0) >= 1) {   // ROAD-17: every intermediate value, as served
      const kk = g.position!;
      row("rung: each open step's multiplier == the exact fraction (binary64), value == floor(stake × it)", g.multiplier === multDouble(SLOTS, m, kk) && units8(g.value as any) === pay8(stake8, SLOTS, m, kk),
        `lane ${kk}: ${g.multiplier} / ${g.value} vs ${multDouble(SLOTS, m, kk)} / ${pay8(stake8, SLOTS, m, kk)}`);
    }
    if (q.path === '/road/bet' && 'steps' in q.body) {   // a bet that names its lanes (auto)
      const n = Number(q.body.steps); res.steps = n;
      let capstop: number | null = null; for (let c = 1; c <= n; c++) if (!allowed(stake8, cap8, SLOTS, m, c)) { capstop = c - 1; break; }
      const lim = capstop === null ? n : capstop;
      let reach: number, out: string, hit: number | null;
      if (first !== null && first <= lim) { reach = first - 1; out = 'trap'; hit = first; } else { reach = lim; out = lim === lanes ? 'castle' : 'cashout'; hit = null; }
      if (capstop !== null && capstop < n && out !== 'trap') res.capStops++;
      row('auto (lanes up front): position, outcome and hit replay from the derived field', g.active === false && g.position === reach && g.outcome === out && (g.hit ?? null) === hit,
        `steps ${n}: got ${g.position} ${g.outcome} hit ${g.hit}, expected ${reach} ${out} hit ${hit}`);
      pos = reach;
    } else if (q.path === '/road/action' && q.body.action === 'step') {
      const lane = pos + 1;
      if (lane === first) row('step onto a derived deadly lane ends the round: trap, hit == lane, payout 0', g.active === false && g.outcome === 'trap' && g.hit === lane && g.position === pos && units8(g.payout as any) === 0n, `lane ${lane}`);
      else {
        row('step onto a derived safe lane advances (castle on the last lane)', g.position === lane && (g.active === true || (lane === lanes && g.outcome === 'castle')), `lane ${lane}: ${g.position} ${g.active} ${g.outcome}`);
        pos = lane;
      }
      if (g.active === true && pos < lanes) {
        const o = g.options || {}; const nx = allowed(stake8, cap8, SLOTS, m, pos + 1);
        row('options.step / options.maxWin follow the max-win rule for the next lane', !!o.step === nx && !!o.maxWin === !nx, `next lane ${pos + 1}: ${JSON.stringify(o)}`);
      }
    } else if (q.path === '/road/action' && q.body.action === 'cashout') {
      row('cashout settles at the current lane', g.active === false && g.outcome === 'cashout' && g.position === pos && pos >= 1, `${g.position} vs ${pos}`);
    }
  }
  const stepped = reqs.map(g200).filter((x): x is Game => !!x);
  const deadly = new Set((G.field || []).filter((t) => t < lanes).map((t) => t + 1));
  row('trap set invariant across steps: settled field == derived, no crossed lane deadly, the hit lane deadly',
    eq(G.field, field) && stepped.every((x) => { for (let c = 1; c <= (x.position ?? 0); c++) if (deadly.has(c)) return false; return true; }) && (G.hit == null || deadly.has(G.hit)));
  // ROAD-10: the outcome follows from the derived field alone
  const k = G.position ?? 0; res.k = k; res.outcome = G.outcome;
  const crossedDeadly = first !== null && first <= k;
  const okOutcome = G.outcome === 'trap' ? (G.hit === first && k === first! - 1) : (!crossedDeadly && k >= 1 && (G.outcome === 'castle') === (k === lanes) && (G.outcome === 'cashout' || G.outcome === 'castle'));
  row('outcome from the derived field: a trap ends on exactly the first deadly lane, a win crosses none, the castle is the last lane', okOutcome,
    `outcome ${G.outcome}, position ${k}, hit ${G.hit}, first deadly ${first}`);
  // ROAD-17: the same walk named up front (auto) settles identically to the lane-by-lane play
  if (!('steps' in betq.body)) {
    const target = G.outcome === 'trap' ? k + 1 : k;
    const out = first !== null && first <= target ? 'trap' : (target === lanes ? 'castle' : 'cashout');
    const reach = out === 'trap' ? first! - 1 : target;
    const payAuto = out === 'trap' ? 0n : pay8(stake8, SLOTS, m, reach);
    row('order independence: the lane-by-lane walk named up front settles identically (outcome, position, payout)', out === G.outcome && reach === k && payAuto === units8(G.payout as any), `auto ${out} ${reach} vs ${G.outcome} ${k}`);
  }
  const expPay = G.outcome === 'trap' ? 0n : pay8(stake8, SLOTS, m, k);
  res.payout8 = units8(G.payout as any); res.won = res.payout8 > 0n;
  if (srv) {   // the published 24 h rule
    const left = stepped.filter((x) => x.active === true); const last = left[left.length - 1];
    res.leftK = last ? (last.position ?? 0) : 0; res.leftValue8 = last ? units8(last.value as any) : null;
    if (res.leftK >= 1) row('24 h rule (published): left with lanes crossed -> cashed out by the server at its value', G.outcome === 'cashout' && k === res.leftK && res.payout8 === pay8(stake8, SLOTS, m, res.leftK) && res.payout8 === res.leftValue8,
      `left at lane ${res.leftK}, value ${last?.value}; server ${G.outcome} at ${k}, payout ${G.payout}`);
    else row('24 h rule (published): left with no lane crossed -> one lane walked, cashed out if safe', first === 1 ? (G.outcome === 'trap' && res.payout8 === 0n) : (G.outcome === 'cashout' && k === 1 && res.payout8 === pay8(stake8, SLOTS, m, 1)), `server ${G.outcome} at ${k}`);
  } else {
    row('payout == floor(stake × 99·C(25,k) / (100·C(25−m,k))) at 1e-8, 0 on a trap', res.payout8 === expPay, `served ${G.payout} expected ${expPay}`);
    const rnd = final.response.round;
    if (rnd && typeof rnd === 'object') row('settled round record agrees (roundId, stake, payout)', rnd.roundId === G.roundId && units8(rnd.stake) === stake8 && units8(rnd.payout) === expPay);
    if (k >= 1 && G.outcome !== 'trap') row('served multiplier == the exact fraction 99·C(25,k)/(100·C(25−m,k)) as binary64', G.multiplier === multDouble(SLOTS, m, k), `${G.multiplier} vs ${multDouble(SLOTS, m, k)}`);
    if (det0) row('game_detail agrees (field, position, outcome, payout, nonce)', eq(det0.field, G.field) && det0.position === G.position && det0.outcome === G.outcome && units8(det0.payout as any) === units8(G.payout as any) && det0.fairness?.nonce === fair.nonce);
  }
  res.ok = bad.length === 0;
  return res;
}

export function epochIndex(d: Dataset): Map<string, { seed: Seed; ix: number }> {
  return new Map(d.seeds.map((s, ix) => [s.hashedServerSeed, { seed: s, ix }]));
}

/** Replay every round of a dataset (or the rounds `keep` selects) and aggregate the rows. */
export function replayDataset(d: Dataset, keep: (r: Round) => boolean = () => true) {
  const byHash = epochIndex(d);
  const results = d.rounds.filter(keep).map((r) => replayRound(r, byHash));
  const rows: Record<string, [number, number]> = {};
  for (const x of results) for (const [k, [a, b]] of Object.entries(x.rows)) { const t = rows[k] ||= [0, 0]; t[0] += a; t[1] += b; }
  return { results, rows, bad: results.flatMap((x) => x.bad), okRounds: results.filter((x) => x.ok).length };
}
