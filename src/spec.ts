// HouseBets Hubie's Road — the published spec, as the server answered it (E01: GET /housegames/road/fairness, read by the
// 13 Oct 2026 capture, meta.staticReads['/road/fairness']), and the limits answer (E03). Quoted, never paraphrased.

export const SLOTS = 25;
/** E01 "difficulties": name → [traps, lanes]. */
export const DIFFICULTIES: Readonly<Record<string, readonly [number, number]>> = { easy: [1, 24], medium: [3, 22], hard: [5, 20], daredevil: [10, 15] };
export const DIFFICULTY_NAMES = ['easy', 'medium', 'hard', 'daredevil'] as const;

// The published return has no constant here: src/exhibits.ts reads it from E01 "return" and E02
// rulesRoadReturn at run time and src/rtp-settings.ts builds the RTP-CLAIM claim from it. SLOTS, DIFFICULTIES, SPEC_EXAMPLES,
// SPEC_PAYOUTS, MIN_STAKE and MAX_WIN below stay as constants; ROAD-26 asserts at run time that each equals its exhibit.

/** E01 "rules", verbatim. */
export const RULES = [
  'a difficulty of easy, medium, hard or daredevil (1, 3, 5 or 10 traps on 25 slots)',
  'the trap slots are fixed by the seed pair and the nonce before the first lane is walked',
  'a trap ends the round and pays nothing',
  'after at least one safe lane the round can be cashed out; crossing the last lane reaches the castle and cashes out by itself',
  'a bet may name a number of lanes to walk: they are stepped in order and a round that meets no trap is cashed out at once',
  'a round never pays more than its max win above the stake: a step that would take the cash-out value past it is not taken',
  "a payout is rounded down to the wallet's smallest unit (1e-8) once",
  'a round left without a decision for 24 hours is finished by the server: with lanes crossed it is cashed out at its value; with none, one lane is walked and, if it is safe, the round is cashed out',
] as const;
export const MULTIPLIER_TEXT = 'after k safe lanes on 25 slots with m traps a stake is paid × 99/100 × C(25, k) / C(25 − m, k)';
export const LANE_RULE = 'Lane L (1-based) is deadly iff slot L − 1 is a trap; slots at or past the lanes count lie behind the castle gate and are never walked.';

/** E03 limits: the wallet's minimum stake and max win (USDT, 8 decimals). */
export const MIN_STAKE = '0.01000311';
export const MAX_WIN = '1000310.0961298';

/** E01 "examples": the published worked trap fields and first deadly lanes. */
export const SPEC_EXAMPLES = [
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, difficulty: 'medium', field: [15, 6, 5], trapLane: 6 },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, difficulty: 'easy', field: [15], trapLane: 16 },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, difficulty: 'hard', field: [15, 6, 5, 11, 14], trapLane: 6 },
  { serverSeed: '5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a', clientSeed: 'housebets', nonce: 1, difficulty: 'daredevil', field: [15, 6, 5, 11, 14, 18, 13, 23, 17, 24], trapLane: 6 },
  { serverSeed: 'housebets-demo-server-seed-0001', clientSeed: 'demo-client', nonce: 1, difficulty: 'medium', field: [17, 4, 9], trapLane: 5 },
  { serverSeed: 'housebets-demo-server-seed-0001', clientSeed: 'demo-client', nonce: 2, difficulty: 'daredevil', field: [20, 21, 23, 22, 8, 14, 7, 1, 19, 11], trapLane: 2 },
] as const;

/** E01 "payouts": the published multiplier after k = 1 … lanes safe lanes, per difficulty, as exact fractions (81 cells). */
export const SPEC_PAYOUTS: Readonly<Record<string, readonly string[]>> = {
  easy: ['33/32', '99/92', '9/8', '33/28', '99/80', '99/76', '11/8', '99/68', '99/64', '33/20', '99/56', '99/52', '33/16', '9/4', '99/40', '11/4', '99/32', '99/28', '33/8', '99/20', '99/16', '33/4', '99/8', '99/4'],
  medium: ['9/8', '9/7', '207/140', '2277/1330', '759/380', '759/323', '759/272', '2277/680', '2277/560', '2277/455', '2277/364', '207/26', '207/20', '69/5', '759/40', '759/28', '2277/56', '2277/35', '2277/20', '2277/10', '2277/4', '2277/1'],
  hard: ['99/80', '297/190', '759/380', '8349/3230', '175329/51680', '58443/12920', '8349/1360', '75141/8840', '25047/2080', '2277/130', '6831/260', '5313/130', '5313/80', '2277/20', '8349/40', '8349/20', '75141/80', '25047/10', '175329/20', '525987/10'],
  daredevil: ['33/20', '99/35', '2277/455', '8349/910', '2277/130', '2277/65', '4807/65', '43263/260', '735471/1820', '490314/455', '1470942/455', '735471/65', '245157/5', '1470942/5', '16180362/5'],
};

/** The commitment encoding: sha256 of the server seed's UTF-8 text, lowercase hex (ROAD-01). */
export const COMMITMENT_ENCODING = 'sha256(utf8(serverSeed)) as lowercase hex';
