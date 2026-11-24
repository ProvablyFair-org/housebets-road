# HouseBets Hubie's Road — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** PF-2026-HB11 · **Release:** `v1.0.0` · **Capture:** 12–13 October 2026

**Result: PROVABLY FAIR — Full Pass.** Every replayed round, the 7,600 rounds of the 13 Oct phases and the 66 records of
the 12 Oct file recorded whole, recomputes exactly from its revealed server seed under the algorithm HouseBets publishes:
the trap slots in draw order, the first deadly lane, every lane's outcome, every multiplier and offer, and the payout.
`node verify.js` runs the 23 scored checks of the framework's ROAD profile: 23 PASS, no FLAG and zero fails. Two branches
are declared, not measured: no captured round came near the max win, so the max-win stop was never produced (DL-10), and the
24-hour rule's "with none" branch was never produced by the capture (DL-7); ROAD-14 and ROAD-31 pass with them declared
unwitnessed, as the profile's rules allow.
ROAD-16 (wallet reconciliation) passes on the platform's bet history and the account reconciliation; the comparison of consecutive balances the profile describes was not possible in this capture, because other games were captured on the same account at the same time (MANIFEST.md DL-3).

**Scope:** Live play on HouseBets House Games Hubie's Road (the engine served since October 2026, API slug `road`,
fairness version `canonical`) from one test account in a logged-in browser session, 12–13 October 2026: all four
difficulties, stakes of 0.02, 2 and 10 USDT, auto bets and lane-by-lane play. Theoretical RTP is **99.0000% across all 81
(difficulty, lanes) formula cells, before rounding and before the max-win cap**: the multiplier formula × the counted
survival probability is exactly 99/100 in each (ROAD-19), before each payout is rounded down to 1e-8. The survival probability is the count with every trap layout equally likely; the published draw map is within 2^-32 of equal at each pick and not exactly equal (ROAD-08, worst deviation 2.1913 × 10^-10), and that difference is not carried into the figure. The observed return over the 6,500 Phase A
rounds is 98.44%: variance, not RTP evidence. No external randomness beacon participates, and apart from two deliberate
negative tests (an empty client seed and a cash-out with no lane crossed)
the capture sent no adversarial request to the API (DL-12); the fairness-integrity tests, run separately on HouseBets'
running service by ProvablyFair.org, are in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity
Testing).

Audit report: https://audit.provablyfair.org/casino/housebets/games/road/overview · Repository:
https://github.com/ProvablyFair-org/housebets-road · The full write-up is [MANIFEST.md](MANIFEST.md); the verdict printed by
`node verify.js` is the verdict of record.

## What was verified

- **6,500 real rounds** placed on 13 Oct 2026 at 0.02 USDT, in 130 seed pairs of exactly 50 rounds: each of the four
  difficulties (easy, medium, hard, daredevil: 1, 3, 5 and 10 traps on 25 slots) played 1,625 times with one lane named up
  front, each round recomputed from its revealed server seed — the trap slots in draw order, the first deadly lane, the
  outcome, the multiplier and the payout — against HouseBets' published algorithm (E01).
- **Supplementary sets** (13 Oct 2026): 150 rounds at 2 (100 × the Phase A stake) and 150 at $10 on easy with one lane,
  200 rounds under four client seeds typed by the auditor, and 600 rounds played lane by lane on all four difficulties
  (2,045 safe steps, 386 traps, 213 cash-outs, one castle), every step and every offer shown before a lane checked against
  the formula.
- **The 12 Oct capture**: its 66 records recorded whole are recomputed round by round, including 10 auto bets naming 2 to
  24 lanes as the server settled them; one round, resumed after the capture re-sent a step request many times, is not
  replayed (it is in the reconciliation).
- **Every scored 13 Oct round against the platform's own bet history** (E04), and the whole account's reconciliation (E05)
  checked by its numbers.
- **Simulation:** 1,000,000 rounds per difficulty (4,000,000 in all), each difficulty on its own auditor-chosen seeds
  independent of the operator (fixed labels, so the run reproduces byte for byte), tested for pick uniformity, serial independence and RTP
  convergence at every stopping depth of every difficulty; and every revealed seed of every dataset (160) replayed over
  10,000 nonces to test for seed cherry-picking (ROAD-21; the daredevil subset, printed and not scored, is at z −2.045:
  MANIFEST.md DL-6).
- **The published 99 % RTP**, read at run time from the fairness answer (E01 "return") and the rules panel (E02 "(1% house
  edge)", and its 16 Oct rewording in the live copy, E08), against the exact RTP of the multiplier formula in all 81
  (difficulty, lanes) formula cells, before rounding and before the max-win cap (at a large enough stake the cap stops a round before its deepest lanes, so not every cell is a stop a player can reach at every stake).
- **Observed return** (variance, not RTP evidence): Phase A 127.97775 paid on 130 staked, 98.44%.
- **The 24-hour rule:** a round left open on purpose on 12 Oct was finished by the server 25 h 9 m 22 s after its last
  decision and cashed out at its value (ROAD-31 PASS, with the rule's "with none" branch, never produced by the
  capture, declared unwitnessed; the timing is reported in MANIFEST.md#observations-not-scored).

## Run the audit

Nothing to install: `node verify.js` runs on Node 22, `npm test` (the TypeScript sources) on Node 22.6 or later:

```
node verify.js          # the standalone verifier (generated from tests/verify.ts by npm run build:standalone)
npm test                # the same suite from the TypeScript sources, plus the RNG reference vectors
```

Expected: `scored checks (HARD_FAIL + FLAG): 23 PASS, 0 FAIL, 0 OVERSTATED, 0 operator FLAG, 0 capture FLAG of 23 run (profile: 23 scored checks); informational 1; package checks 7/7 PASS (no gaps)`, then `VERDICT: PROVABLY FAIR — Full Pass`, `REPRODUCED`, exit 0.

`npm run mutate` runs the falsifiability battery (each mutation must change the status of the step it names from its
status in an unmutated copy; a step that aborts counts as not caught) and writes `outputs/mutation-results.json`;
`npm run gate:fresh` (run it in a disposable copy of the package: a passing run rewrites the pinned record
`outputs/fresh-copy.json`, which names the Node version, so on another Node 22 patch the rewritten record no longer equals its pin) re-runs the package from a fresh copy, compares the regenerated artifacts with the committed ones and
writes `outputs/fresh-copy.json`. Both records carry the fingerprint of the code and data they ran against and are pinned
in RELEASE-MANIFEST.json, which pins every file of the package except itself; `node scripts/release-manifest.mjs --check`
confirms every pinned file and rebuilds `site-verifier/derive.js` with bun 1.3.9, requiring the shipped file to equal the
rebuild. `verify` re-runs the whole simulation rather than trusting the stored results: 13 s on an Apple M2 Max (12 cores, Node 22.23.1), measured on 19 Nov 2026 at load average 8. A run in which a scored check of the framework profile (`profile/profile.json`, its sha256 checked) records
no status, or whose step list departs from that profile, prints `VERDICT: INCOMPLETE` and exits 3, provided nothing else
FAILs (a FAIL ranks first and exits 1; a step deleted without regenerating the committed record also fails ROAD-27). A step
that throws (a missing file) is scored FAIL, the other steps still run, and the run ends NOT PROVABLY FAIR, exit 1.

## Verdict and exit codes

`node verify.js` (and `npm run verify`) ends with one `VERDICT:` line and its exit code. Framework 1.1; RTP-CLAIM 1.2.0 is
switched on (Methodology v1.1). The codes and their order are the same in all 11 HouseBets new-engine packages:

| exit | verdict | when |
|---|---|---|
| 0 | PROVABLY FAIR — Full Pass | every scored check passes (a capture-origin FLAG is disclosed and does not move the verdict) |
| 2 | PROVABLY FAIR — Conditional Pass | an operator-origin FLAG, nothing worse |
| 5 | RTP FIGURE OVERSTATED | ROAD-19: the published RTP figure is missed on the house side by more than 0.1 pp; the draws pass |
| 3 | INCOMPLETE | a scored check of the profile has no status from this run, or `src/profile-map.ts` departs from `profile/profile.json`, and no check FAILs; or the run aborted |
| 1 | NOT PROVABLY FAIR | a scored check fails; or a step throws (a file missing, a dataset field null or absent: the checks it scores print FAIL with the error, the other steps still run); or a release-gate record (`outputs/fresh-copy.json`, `outputs/mutation-results.json`) is missing or is not the bytes RELEASE-MANIFEST.json pins (its check prints FAIL) |
| 4 | (no verdict) | `verify.js` was not built from the sources beside it; rebuild with `npm run build:standalone` |

When more than one applies: NOT PROVABLY FAIR > INCOMPLETE > RTP FIGURE OVERSTATED > Conditional Pass > Full Pass.

## Verify a bet

Check your round at [provablyfair.org/verify-bets/housebets](https://www.provablyfair.org/verify-bets/housebets); the
page runs `site-verifier/derive.js` from this release (sha256 `6ac09752e8745ea18a9b34b9bbfb26d93f185d55e42788b7f3ae213bcde25e84`).
ROAD-24 runs that file side by side with `src/rng.ts` on every replayed round (MANIFEST.md, Player verifiers). The steps
below, and the script after them, check a round by hand, without the page.

1. **Save the hashed server seed before you bet.** Before your first round on a seed pair, save the `hashedServerSeed` of
   your active pair. That saved copy is what shows the seed was fixed before your rounds: a match against a hash read after
   the rounds only shows consistency (hash equality), because a seed and hash made after the round would also match. This
   package reads the hash from the game's seed-pair answer; where the game's screen shows it was not captured (DL-4).
2. **Reveal the seed.** A round can only be checked once its server seed is revealed, which happens when you rotate the seed
   pair: the server's answer to the rotation (`POST /housegames/change_seed`) carries the previous server seed. That is what
   the API and the game's code show; the rendered fairness window was not captured for this package (DL-4).
3. **Collect the fields:** the revealed server seed, your client seed, the round's nonce (HouseBets nonces start at 1 on a
   fresh seed pair and count every round) and the difficulty (easy 1 trap / 24 lanes, medium 3 / 22, hard 5 / 20,
   daredevil 10 / 15).
4. **Check the commitment:** `sha256` of the server seed's text (UTF-8), as lowercase hex, must equal the hashed server seed
   you saved in step 1.
5. **Recompute the traps.** The HMAC key is the server seed's **64-character hex text, encoded as UTF-8**, not the 32 bytes
   that text hex-decodes to. HouseBets does not hex-decode the seed: with a
   hex-decoded key, 58 of the 6,500 Phase A rounds give the served trap set. For block b = 0, 1, … compute
   `block_b = HMAC-SHA256(key = server seed, message = "clientSeed:nonce:b")` and concatenate them; each block yields 8
   draws, so daredevil's 10 traps need blocks 0 and 1. Trap i (i = 0, 1, …) is bytes 4i..4i+3 of `block_0 ‖ block_1 ‖ …`
   read as a big-endian 32-bit integer u, so trap i comes from block b = floor(i / 8). Keep the slots 0 … 24 not yet picked
   in ascending order; trap i is the slot at position `floor(u × (25 − i) / 2^32)` among them. A difficulty with m traps
   takes the first m picks, in the order the round's `field` lists them. Lane L (counting from 1) is deadly when slot L − 1
   is a trap; slots at or past the lanes count are never walked.
6. **Apply the published rule** (E01): a trap ends the round and pays nothing; after k safe lanes the multiplier is
   0.99 × C(25, k) / C(25 − m, k); crossing the last lane reaches the castle and cashes out; the payout is stake × multiplier
   rounded down to 0.00000001 once. **Max win:** a lane is offered only while its payout minus the stake stays within the
   round's max win (E01 rules: "a step that would take the cash-out value past it is not taken"; the limits answer gives
   1,000,310.0961298 USDT). At a large stake the deepest lanes are therefore not available and the round is cashed out
   before them: at a stake of 10 on daredevil, lane 13 would pay 490,314 and is offered, lane 14 would pay 2,941,884 and is
   not. No captured round came near the max win, so this branch is the published rule, not an observed settlement
   (MANIFEST.md DL-10).

The script below does steps 4 and 5. Its constants hold the worked example V3 of [docs/ALGORITHM.md](docs/ALGORITHM.md)
(round `50550bba-451b-4a74-a509-a61d70d3e02a`, Phase A: daredevil, nonce 1); replace them with your round's values. Save it as a `.mjs` file and run it with `node` (Node 18 or later, nothing to install).

```javascript
// node verify-round.mjs — paste your round's values into the constants below
// serverSeedHashed: the hashed server seed you saved BEFORE your first round on this seed pair
import { createHash, createHmac } from 'node:crypto';
const serverSeed = 'd47204ce3b9a3db3d6cf9261870235050ca4c3a2b8cc18d3df9d69ae9b7b7f3a';
const serverSeedHashed = 'b947a5d9e715ce68c4e357bef51e829dafc092adee65529846073b0de3da15a7';
const clientSeed = 'pfroadstartef10f9de62e53357f791a5bf3b0fcca1', nonce = 1;
const traps = 10, lanes = 15;                          // easy 1 / 24, medium 3 / 22, hard 5 / 20, daredevil 10 / 15
const field = [16, 22, 20, 1, 5, 13, 7, 6, 18, 21];   // the round's `field`, in order

const key = Buffer.from(serverSeed, 'utf8');   // the seed's 64-character text as UTF-8, NOT hex-decoded
const hashMatches = createHash('sha256').update(key).digest('hex') === serverSeedHashed;
const left = Array.from({ length: 25 }, (_, s) => s), picks = [];
let block;
for (let i = 0; i < traps; i++) {              // trap i reads bytes 4i..4i+3 of block_0 ‖ block_1 ‖ …: block b = floor(i / 8)
  const b = Math.floor(i / 8);
  if (i % 8 === 0) block = createHmac('sha256', key).update(`${clientSeed}:${nonce}:${b}`).digest();
  const u = block.readUInt32BE(4 * (i % 8));
  picks.push(left.splice(Math.floor(u * (25 - i) / 2 ** 32), 1)[0]);
}
const deadly = picks.filter((s) => s < lanes).map((s) => s + 1);   // lane L is deadly when slot L − 1 is a trap
console.log(JSON.stringify({ hashMatches, field: picks, trapLane: deadly.length ? Math.min(...deadly) : null, matches: JSON.stringify(picks) === JSON.stringify(field) }));
```

On the example it prints `{"hashMatches":true,"field":[16,22,20,1,5,13,7,6,18,21],"trapLane":2,"matches":true}`: the served
field in the served order and the served first deadly lane, 2. `hashMatches: true` is hash equality with the value you
pasted; paste the one you saved before betting. The round named one lane, lane 1 is safe, so it won at k = 1: multiplier
2475/1500 = 1.65, payout 0.033, as served.

`src/rng.ts` and `src/rules.ts` are the same steps in the package's code; [docs/ALGORITHM.md](docs/ALGORITHM.md) states the
algorithm step by step with its sources and test vectors, and [docs/INTERFACE.md](docs/INTERFACE.md) the module interface.

## Files and evidence

- [Phase A dataset](data/housebets-road-phaseA-auto1-6500rounds.json) — 6,500 rounds, SHA-256 `56e58a1c3316d8f3a79c6558e61aa5c61eea8e81ce6d05a8af4b94b98d885690`.
- [Phase C](data/supplementary/housebets-road-phaseC-elevated-150rounds.json) — 150 rounds at 2, SHA-256 `a4f540a25def753cc6813b939bdb2d6176329f8a9a6be96ceddfa5abedac1968`.
- [Phase C, $10 set](data/supplementary/housebets-road-phaseC-elevated-10usd-150rounds.json) — 150 rounds at 10, SHA-256 `4b64dc99a05a44add4d05b52e6e737b6505f3d42570121c2ebbee90f2449e67a`.
- [Phase D](data/supplementary/housebets-road-phaseD-playerseeds-200rounds.json) — 200 rounds under player-set seeds, SHA-256 `e2e81e4388d1b0973347c39f7964689082f5c631fbc85eec0a7f53a45ff6b5e6`.
- [Phase E](data/supplementary/housebets-road-phaseE-multistep-600rounds.json) — 600 lane-by-lane rounds, SHA-256 `5a4635d851701ab9c6cbdbc0a0cd513c8c653c2d726a5164eeffb92c730c0f82`.
- [12 Oct file](data/supplementary/housebets-road-full-67rounds-withopen.json) — 67 records, SHA-256 `02ba95c67529eab6e7f10822d7260f4670d6060c15d7b4f4edb854c99d7e583a`.
- `docs/` the algorithm specification and module interface · `evidence/` E01–E08 · `profile/` the framework's ROAD profile
  1.0.2-public (byte copy, sha256 checked by verify) · `capture/` a redacted reference copy of the capture code (the as-run
  script, sha256 `f7c1ed68…` in the 13 Oct datasets' meta, is held privately; MANIFEST.md#evidence) · `outputs/` the pinned simulation census, RTP table and verification record,
  and the committed mutation and fresh-copy records · `src/` the derivation and the round replay · `tests/verify.ts` the 31
  checks of the ROAD profile · `scripts/` evidence builder, mutation battery, fresh-copy gate, standalone build, release
  manifest, code fingerprint, site-verifier build · `site-verifier/derive.js` the ProvablyFair.org verifier module for this
  game, generated from `src/rng.ts`. Every dataset is pinned in `src/loader.ts` and checked by ROAD-26. See MANIFEST.md#evidence.
- [Audit report](https://audit.provablyfair.org/casino/housebets/games/road/overview) · [Public repository](https://github.com/ProvablyFair-org/housebets-road) · [MIT license](LICENSE).

The release commit and tag are signed with the ProvablyFair.org release key (SSH,
`SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY`), which the release manifest records.
