// HouseBets Hubie's Road — the simulation CENSUS (ROAD-20 Pass 1, ROAD-21 Pass 2). A pure function of src/sim-config.ts and
// the package's datasets: counts and exact integer sums only, re-derived into statistics by the verifier, which re-runs this
// census in full. Pass 2 replays every revealed seed of every dataset (src/loader.ts ALL_DATASETS).
//   npm run simulate        rewrite outputs/simulation-results.json (the pinned artifact) and print its sha256
//   npm run simulate:run    write outputs/run/simulation-results.json (a regeneration, compared by scripts/fresh-copy-check.mjs)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { positionFromU, sha256Hex, SLOTS } from './rng.ts';
import { DIFFICULTIES, DIFFICULTY_NAMES } from './spec.ts';
import { ROOT, load, ALL_DATASETS } from './loader.ts';
import { PASS1_SEEDS, PASS1_NONCES, PICKS_PER_ROUND, pass1Seed, SIM_PASS2_NONCES, SIM_PASS2_EARLY_WINDOW_RULE, PASS2_SLOT_RULE, PASS2_UNIT, PASS2_D, FRESH_SEED_RULE } from './sim-config.ts';
import type { Dataset } from './types.ts';

/** byCell: per (difficulty/lanes) cell the window's [rounds, wins] — what the per-slot standardised return (ROAD-21) is
 *  computed from. ret12, meanD and varD2 (the pooled return printed for Phase A) are carried on the Phase A epochs only. */
export interface Window { rounds: number; wins: number; byCell: Record<string, [number, number]>; ret12?: string; meanD?: string; varD2?: string }
export interface Census {
  design: Record<string, unknown>;
  pass1: {
    rounds: number;             // per difficulty, each on its own seeds
    stepRounds: number[];       // [step i]: rounds that drew a step i (every difficulty with more than i traps)
    stepIndex: number[][];      // [step i][position j among the 25 − i slots left]
    slotAtStep: number[][];     // [slot t][step i]: rounds in which slot t was the i-th pick
    minTrap: Record<string, number[]>;   // difficulty → [K]: rounds whose smallest trap slot is K (K = 0 … 25 − m)
    firstPick: { n: number; sumX: string; sumX2: string; sumXY: string; upper: number; runs: number };
  };
  pass2: { epochs: { set: string; epoch: number; seedHash: string; early: Window; ref: Window }[] };
}

const fresh = (label: string): string => sha256Hex(label);

function pass1(): Census['pass1'] {
  const S = PICKS_PER_ROUND;
  const stepIndex = Array.from({ length: S }, (_, i) => new Array(SLOTS - i).fill(0));
  const slotAtStep = Array.from({ length: SLOTS }, () => new Array(S).fill(0));
  const minTrap: Record<string, number[]> = Object.fromEntries(DIFFICULTY_NAMES.map((d) => [d, new Array(SLOTS - DIFFICULTIES[d][0] + 1).fill(0)]));
  const stepRounds = new Array(S).fill(0);
  let sx = 0n, sx2 = 0n, sxy = 0n, prev = -1, n = 0, upper = 0, runs = 0; let lastUp: boolean | null = null;
  const left = new Array<number>(SLOTS);
  for (const d of DIFFICULTY_NAMES) for (let s = 0; s < PASS1_SEEDS; s++) {
    const M = DIFFICULTIES[d][0];   // this difficulty's rounds are drawn to its own M picks, on its own seeds
    const { server, client } = pass1Seed(d, s); const key = Buffer.from(fresh(server), 'utf8');
    for (let nonce = 1; nonce <= PASS1_NONCES; nonce++) {
      for (let i = 0; i < SLOTS; i++) left[i] = i;
      let blk = 0, buf: Buffer | null = null, off = 32, rem = SLOTS, mn = SLOTS;
      for (let i = 0; i < M; i++) {
        if (off === 32) { buf = createHmac('sha256', key).update(`${client}:${nonce}:${blk++}`).digest(); off = 0; }
        const j = positionFromU(buf!.readUInt32BE(off), rem); off += 4;
        const t = left[j]; left.splice(j, 1); rem--;
        stepIndex[i][j]++; slotAtStep[t][i]++; stepRounds[i]++;
        if (t < mn) mn = t;
        if (i === M - 1) minTrap[d][mn]++;
        if (i === 0) {
          const X = BigInt(t); sx += X; sx2 += X * X; if (prev >= 0) sxy += BigInt(prev) * X; prev = t; n++;
          const up = 2 * t >= SLOTS; if (up) upper++; if (up !== lastUp) { runs++; lastUp = up; }
        }
      }
    }
  }
  return { rounds: PASS1_SEEDS * PASS1_NONCES, stepRounds, stepIndex, slotAtStep, minTrap, firstPick: { n, sumX: String(sx), sumX2: String(sx2), sumXY: String(sxy), upper, runs } };
}

/** The one-lane return of a difficulty with m traps in 1e-12 units: floor(99·25 / (100·(25 − m)) · 10^12). */
export const mult12 = (m: number): bigint => (99n * 25n * PASS2_UNIT) / (100n * BigInt(SLOTS - m));
/** Its exact mean × D and variance × D² for a fair field: P(lane 1 safe) = (25 − m)/25, D = 25. */
export const meanD = (m: number): bigint => mult12(m) * BigInt(SLOTS - m) * (PASS2_D / 25n);
export const varD2 = (m: number): bigint => mult12(m) ** 2n * BigInt(SLOTS - m) * BigInt(m) * (PASS2_D / 25n) ** 2n;

/** One played slot: the difficulty d (m traps) and the lanes K the round walks to; `won` is the SERVED outcome (payout > 0),
 *  which the replay of the early window must reproduce. */
export interface Slot { d: string; m: number; K: number; nonce: number; won: boolean }

/** Does a round walking K lanes on a difficulty of m traps win at this nonce: is no trap among slots 0 … K − 1? (draws only as
 *  far as needed) */
export function slotWins(key: Buffer, client: string, nonce: number, m: number, K: number): boolean {
  const left = Array.from({ length: SLOTS }, (_, i) => i);
  let blk = 0, buf: Buffer | null = null, off = 32;
  for (let i = 0; i < m; i++) {
    if (off === 32) { buf = createHmac('sha256', key).update(`${client}:${nonce}:${blk++}`).digest(); off = 0; }
    const j = positionFromU(buf!.readUInt32BE(off), SLOTS - i); off += 4;
    if (left.splice(j, 1)[0] < K) return false;
  }
  return true;
}

const g200 = (q: any): any => (q && q.status === 200 && q.response && typeof q.response === 'object' && q.response.game) ? q.response.game : null;
/** The server's settled answer of a record (the 24 h round: the server's own record of finishing it), or null. */
function settledOf(r: Dataset['rounds'][number]): any {
  if (r.closedByServer && r.detail?.response?.game?.active === false) return r.detail.response.game;
  const q = [...r.requests].reverse().find((x) => g200(x)?.active === false); return q ? g200(q) : null;
}

/** Every epoch's played slots in nonce order (PASS2_SLOT_RULE). One slot per served round; records that share a round id give
 *  one slot, from the record that holds the settled answer. */
export function playedSlots(ds: Dataset): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>(); const seen = new Set<string>();
  for (const r of ds.rounds) {
    const g = settledOf(r); if (!g || !g.fairness?.hashedServerSeed) continue;
    const id = String(g.roundId); if (seen.has(id)) throw new Error(`round ${id} settled on two records`); seen.add(id);
    const sp: any = r.spec; const K = Number(sp.steps ?? sp.stopLane); const d = String(g.difficulty);
    const h = g.fairness.hashedServerSeed; const a = out.get(h) || []; out.set(h, a);
    a.push({ d, m: DIFFICULTIES[d][0], K, nonce: Number(g.fairness.nonce), won: Number(g.payout) > 0 });
  }
  for (const a of out.values()) a.sort((x, y) => x.nonce - y.nonce);
  return out;
}

export function census(sets: readonly (readonly [string, Dataset])[], onProgress?: (s: string) => void): Census {
  const p1 = pass1(); onProgress?.(`pass 1: ${DIFFICULTY_NAMES.length} difficulties × ${p1.rounds} rounds`);
  const epochs: Census['pass2']['epochs'] = [];
  for (const [set, ds] of sets) {
    const slots = playedSlots(ds); const pooled = set === 'A';
    for (const sd of ds.seeds) {
      const played = slots.get(sd.hashedServerSeed) || []; if (!played.length) continue;
      if (pooled && played.some((s) => s.K !== 1)) throw new Error('the pooled Phase A return is defined on one-lane rounds');
      const key = Buffer.from(sd.revealedServerSeed, 'utf8');
      const early = played.length;   // the early window is the captured nonces 1 … n of the seed (SIM_PASS2_EARLY_WINDOW_RULE)
      const z = () => ({ rounds: 0, wins: 0, ret: 0n, mean: 0n, v: 0n, by: new Map<string, [number, number]>() });
      const acc = { early: z(), ref: z() };
      for (let nonce = 1; nonce <= SIM_PASS2_NONCES; nonce++) {
        const s = played[(nonce - 1) % played.length];
        const win = slotWins(key, sd.clientSeed, nonce, s.m, s.K);
        const a = nonce <= early ? acc.early : acc.ref;
        a.rounds++; if (win) a.wins++;
        if (pooled) { if (win) a.ret += mult12(s.m); a.mean += meanD(s.m); a.v += varD2(s.m); }
        const bk = `${s.d}/${s.K}`; const b = a.by.get(bk) || [0, 0]; b[0]++; if (win) b[1]++; a.by.set(bk, b);
      }
      const out = (a: ReturnType<typeof z>): Window => ({ rounds: a.rounds, wins: a.wins,
        byCell: Object.fromEntries([...a.by.entries()].sort(([x], [y]) => x.localeCompare(y, 'en', { numeric: true }))),
        ...(pooled ? { ret12: String(a.ret), meanD: String(a.mean), varD2: String(a.v) } : {}) });
      epochs.push({ set, epoch: Number(sd.epoch), seedHash: sd.hashedServerSeed, early: out(acc.early), ref: out(acc.ref) });
    }
  }
  onProgress?.(`pass 2: ${epochs.length} epochs × ${SIM_PASS2_NONCES}`);
  return {
    design: { freshSeedRule: FRESH_SEED_RULE, pass1: { seedsPerDifficulty: PASS1_SEEDS, noncesPerSeed: PASS1_NONCES, picksPerRound: 'm, the difficulty\'s traps', seeds: 'each difficulty on its own seed labels', difficulties: Object.fromEntries(DIFFICULTY_NAMES.map((d) => [d, [...DIFFICULTIES[d]]])), survival: 'k lanes survive iff the smallest trap slot is >= k', serialStatistic: 'pick 0 slot of every round in census order; upper = 2·slot ≥ 25' },
      pass2: { nonces: SIM_PASS2_NONCES, earlyWindow: SIM_PASS2_EARLY_WINDOW_RULE, slot: PASS2_SLOT_RULE, datasets: sets.map(([k]) => `${k}: ${ALL_DATASETS.find(([x]) => x === k)?.[1] ?? '?'}`),
        units: 'byCell = per difficulty/lanes [rounds, wins]; Phase A epochs also carry the pooled return: ret12 = sum of floor(multiplier·10^12) over wins; meanD = sum of mult12·(25−m)·(D/25); varD2 = sum of mult12²·(25−m)·m·(D/25)²; D = 25' } },
    pass1: p1, pass2: { epochs },
  };
}

export const censusText = (c: Census): string => JSON.stringify(c) + '\n';

if (process.argv[1] && /simulate\.ts$/.test(process.argv[1])) {
  const t0 = Date.now();
  const c = census(ALL_DATASETS.map(([k, f]) => [k, load(f)] as const), (s) => console.log(`  ${s}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`));
  const text = censusText(c);
  const emit = process.env.PF_EMIT === '1';
  const dir = emit ? join(ROOT, 'outputs') : join(ROOT, 'outputs', 'run'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'simulation-results.json'), text);
  console.log(`wrote ${emit ? 'outputs' : 'outputs/run'}/simulation-results.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
