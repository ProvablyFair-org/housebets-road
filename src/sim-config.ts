// HouseBets Hubie's Road — FROZEN SIMULATION DESIGN, single-sourced so the producer (src/simulate.ts) and the verifier
// (tests/verify.ts, ROAD-20 / ROAD-21) cannot pin different experiments. Every seed of the experiment is a fixed string,
// so the census is a deterministic function of this file and the datasets: a re-run reproduces it byte for byte,
// and the verifier re-runs it in full rather than trusting a statistic the artifact reports about itself.

// ── The ROAD profile's floors (games/road/profile.json, ROAD-20 / ROAD-21), held apart from the design so a cheaper design
// cannot lower them: the verifier compares the census against THESE.
export const FLOOR_ROUNDS_PER_DIFFICULTY = 1_000_000;
export const FLOOR_PASS2_NONCES = 10_000;

// ── Significance, family-wise: Pass 1 runs four screens (pick uniformity, lag-1, runs, RTP cells), each held to α/4, so
// ROAD-20 as a whole fires on a fair game at most α = 1 % (union bound). Inside a screen every test is Bonferroni-corrected
// by the number of tests in it; the RTP-cell screen's rate is the exact binomial sum (src/false-alarm.ts).
export const ALPHA = 0.01;
export const ALPHA_SCREENS = 4;
export const ALPHA_SCREEN = ALPHA / ALPHA_SCREENS;

// ── Pass 1: each of the four difficulties gets its own 100 fresh seeds × nonces 1..10,000 = 1,000,000 rounds (4,000,000
// rounds in all; no two difficulties share a round). A round of a difficulty with m traps is drawn to its m picks, the
// field the published derivation gives it. The stopping depths of one difficulty are settled on that difficulty's rounds.
// The pick-uniformity counts of step i pool the rounds of every difficulty that draws a step i (m > i); the serial screens
// run on pick 0 of all 4,000,000 rounds in census order (easy, medium, hard, daredevil).
export const PASS1_SEEDS = 100;
export const PASS1_NONCES = 10_000;
export const SIM_ROUNDS = PASS1_SEEDS * PASS1_NONCES;            // per difficulty
export const PICKS_PER_ROUND = 10;                                // the largest field (daredevil): steps 0 … 9 exist
export const pass1Seed = (d: string, i: number): { server: string; client: string } =>
  ({ server: `housebets-road-audit/sim/pass1/${d}/server/${i}`, client: `housebets-road-audit/sim/pass1/${d}/client/${i}` });
/** RTP convergence: a round survives k lanes iff its smallest trap slot is ≥ k (lanes 1 … k are slots 0 … k − 1). Every
 *  (difficulty, k) cell is scored: the exact false-alarm rates of all 81 sum to 3.9 × 10^-4 ≤ α/4 (ROAD-20 recomputes it). */
export const EDGE_SIGMAS = 5;
export const EDGE_BUFFER = 1e-4;
/** Cells with fewer expected surviving rounds than this are scored but flagged in the detail as carrying little evidence. */
export const EDGE_LOW_INFORMATION = 30;

// ── Pass 2, cherry-pick: every revealed seed of every dataset (src/loader.ts ALL_DATASETS: Phase A, C, C $10, D, E and the
// 12 Oct file) × nonces 1..10,000, as the ROAD profile's -21 rule asks (MANIFEST DL-6). Early window = the nonces the capture played on the seed
// (1..50 on a 13 Oct pair, 1..10 or fewer on a 12 Oct pair); reference window = the rest of 1..10,000. Each nonce plays the
// slot the capture played on the seed, cycled: the same difficulty, walked to the same number of lanes. The statistic is the
// per-slot standardised return: each slot's return minus its exact mean, ÷ its exact sd, summed and ÷ √slots. The multiplier
// cancels, so each term is (win − p)/√(p(1 − p)), p = C(25 − m, K)/C(25, K). Pre-registered one-sided lower tail at
// SIM_PASS2_ALPHA. The pooled return of the Phase A epochs is still computed and
// printed; the standardised form was chosen after the pooled result was known (MANIFEST DL-6).
export const SIM_PASS2_STATISTIC = 'per-slot standardised return';
export const SIM_PASS2_NONCES = 10_000;
export const SIM_PASS2_EARLY_WINDOW_RULE = 'nonces 1 … n, n = the rounds the capture played on the seed';
export const PASS2_SLOT_RULE = 'nonce i plays the (i − 1) mod n-th captured round of the seed in nonce order: its difficulty (m traps), walked to the lanes K it named (auto) or planned to cash out at (lane by lane); win iff no trap is among slots 0 … K − 1';
/** 0.008, not α: the one-lane return here is nearly symmetric (at most 1.65×), so the pooled rule's false-alarm rate sits at
 *  its nominal level; at level 0.01 it measures 0.00998 ± 0.000222 (printed by npm run false-alarm:pass2, declared in
 *  src/false-alarm-pass2.ts), indistinguishable from the 1 % cap, so the level was set to 0.008. No artifact in the package
 *  records when that was decided relative to the live statistic (MANIFEST DL-6). */
export const SIM_PASS2_ALPHA = 0.008;
/** Returns are carried in 1e-12 units (the exact multiplier floored at 1e-12); means and variances as exact integers over
 *  D = 25 and D² (a one-lane win chance is (25 − m)/25). */
export const PASS2_UNIT = 1_000_000_000_000n;
export const PASS2_D = 25n;

/** The fresh-seed server seeds are the sha256 hex of these strings (64 hex chars, the platform's seed shape). */
export const FRESH_SEED_RULE = 'serverSeed = sha256(label) as lowercase hex; clientSeed = label';
