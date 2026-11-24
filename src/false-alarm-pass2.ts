// ROAD-21 Pass 2 — the false-alarm rate of its rule on honest data, DECLARED here and re-checkable with `npm run false-alarm:pass2`.
// The SCORED rule rejects when the per-slot STANDARDISED early-window return of every played slot of every revealed seed
// (src/simulate.ts playedSlots over src/loader.ts ALL_DATASETS) — each slot's return minus its exact mean, ÷ its exact sd,
// summed and ÷ √slots; that term is (win − p)/√(p(1 − p)), p = C(25 − m, K)/C(25, K) — has a one-sided normal lower-tail p
// below SIM_PASS2_ALPHA (0.008). The pooled rule on the Phase A slots (MANIFEST DL-6; the aggregate return
// standardized by its exact mean and variance) is declared too, at 0.008 and at 0.01 (the calibration that set the level),
// so every printed figure stays checkable. No closed form; this is a plain Monte Carlo over the played slots (fixed seed,
// xoshiro128**), the rate the share of replicates the rule rejects.
import { load, PRIMARY_FILE, ALL_DATASETS } from './loader.ts';
import { DIFFICULTIES } from './spec.ts';
import { normalLowerTailP } from './stats.ts';
import { SIM_PASS2_ALPHA, SIM_PASS2_STATISTIC } from './sim-config.ts';
import { playedSlots } from './simulate.ts';
import { survivalComb, fracToDouble } from './rules.ts';
import { SLOTS } from './rng.ts';

export const PASS2_FALSE_ALARM = Object.freeze({
  rate: 0.00812,
  standardError: 0.000201,
  replicates: 200_000,
  seed: 20261013,
  level: SIM_PASS2_ALPHA,
  slots: 7667,
  method: 'plain Monte Carlo over the played slots of every revealed seed (win ~ Bernoulli(C(25 − m, K)/C(25, K))), the per-slot standardised rule applied to each replicate',
  statistic: SIM_PASS2_STATISTIC,
});
/** The pooled rule on the 6,500 Phase A slots (MANIFEST DL-6), at the scored level (declared 13 Oct) and at 0.01 (the
 *  calibration behind the level). */
export const PASS2_FALSE_ALARM_POOLED = Object.freeze({ rate: 0.00793, standardError: 0.000198, replicates: 200_000, seed: 20261013, level: SIM_PASS2_ALPHA });
export const PASS2_FALSE_ALARM_POOLED_AT_001 = Object.freeze({ rate: 0.00998, standardError: 0.000222, replicates: 200_000, seed: 20261013, level: 0.01 });

function xoshiro(seed: number) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  return (): number => {
    const r = (Math.imul(Math.imul(b, 5) << 7 | Math.imul(b, 5) >>> 25, 9)) >>> 0;
    const t = b << 9; c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
    return r / 4294967296;
  };
}

const phaseASlots = () => load(PRIMARY_FILE).rounds.map((r) => { const q = r.requests.find((x) => x.path === '/road/bet')!; return { N: 25, m: DIFFICULTIES[String(q.body.difficulty)][0] }; });
/** The win chance of every played slot of every revealed seed, in dataset and nonce order. */
export const slotChances = (): number[] => ALL_DATASETS.flatMap(([, f]) => [...playedSlots(load(f)).values()].flat().map((s) => { const [c, d] = survivalComb(SLOTS, s.m, s.K); return fracToDouble(c, d); }));
const done = (rej: number, replicates: number, seed: number, slots: number) => { const rate = rej / replicates;
  return { rate: Number(rate.toFixed(5)), standardError: Number(Math.sqrt(rate * (1 - rate) / replicates).toPrecision(3)), replicates, seed, slots }; };

/** The scored (per-slot standardised) rule. */
export function simulatePass2FalseAlarm(replicates: number, seed: number, level = SIM_PASS2_ALPHA) {
  const p = Float64Array.from(slotChances());
  const up = Float64Array.from(p, (q) => (1 - q) / Math.sqrt(q * (1 - q))), down = Float64Array.from(p, (q) => -q / Math.sqrt(q * (1 - q)));
  const root = Math.sqrt(p.length), rnd = xoshiro(seed);
  let rej = 0;
  for (let r = 0; r < replicates; r++) {
    let s = 0; for (let i = 0; i < p.length; i++) s += rnd() < p[i] ? up[i] : down[i];
    if (normalLowerTailP(s / root) < level) rej++;
  }
  return done(rej, replicates, seed, p.length);
}

/** The pooled rule on the Phase A slots (MANIFEST DL-6). */
export function simulatePass2FalseAlarmPooled(replicates: number, seed: number, level = SIM_PASS2_ALPHA) {
  const slots = phaseASlots();
  const p = Float64Array.from(slots, (s) => (s.N - s.m) / s.N);
  const m = Float64Array.from(slots, (s) => (99 * s.N) / (100 * (s.N - s.m)));
  let mean = 0, v = 0; for (let i = 0; i < p.length; i++) { mean += m[i] * p[i]; v += m[i] * m[i] * p[i] * (1 - p[i]); }
  const sd = Math.sqrt(v), rnd = xoshiro(seed);
  let rej = 0;
  for (let r = 0; r < replicates; r++) {
    let s = 0; for (let i = 0; i < p.length; i++) if (rnd() < p[i]) s += m[i];
    if (normalLowerTailP((s - mean) / sd) < level) rej++;
  }
  return done(rej, replicates, seed, p.length);
}

if (process.argv[1] && /false-alarm-pass2\.ts$/.test(process.argv[1])) {
  let all = true;
  const chk = (label: string, r: { rate: number; standardError: number; slots: number }, d: { rate: number; standardError: number; slots?: number }) => {
    const same = r.rate === d.rate && r.standardError === d.standardError && (d.slots === undefined || d.slots === r.slots); all &&= same; console.log(label, JSON.stringify(r), same ? '== the declaration' : '!= the declaration'); };
  chk(`scored (per-slot standardised) at ${SIM_PASS2_ALPHA}:`, simulatePass2FalseAlarm(PASS2_FALSE_ALARM.replicates, PASS2_FALSE_ALARM.seed), PASS2_FALSE_ALARM);
  chk(`pooled (Phase A, scored until 14 Oct) at ${SIM_PASS2_ALPHA}:`, simulatePass2FalseAlarmPooled(PASS2_FALSE_ALARM_POOLED.replicates, PASS2_FALSE_ALARM_POOLED.seed), PASS2_FALSE_ALARM_POOLED);
  chk('pooled at 0.01 (the calibration behind the 0.008 level):', simulatePass2FalseAlarmPooled(PASS2_FALSE_ALARM_POOLED_AT_001.replicates, PASS2_FALSE_ALARM_POOLED_AT_001.seed, 0.01), PASS2_FALSE_ALARM_POOLED_AT_001);
  process.exitCode = all ? 0 : 1;
}
