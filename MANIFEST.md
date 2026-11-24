# HouseBets Hubie's Road — Consolidated Audit Overview (new engine)

**Release:** `v1.0.0` (the first public release) · **Audit ID:** PF-2026-HB11 · **Auditor:** ProvablyFair.org · **Framework:** 1.1

Audit report: https://audit.provablyfair.org/casino/housebets/games/road/overview · Repository:
https://github.com/ProvablyFair-org/housebets-road. The machine-readable release identity is in
[RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

The ROAD profile is 1.0.2-public: 1.0.0 as approved on 14 Oct 2026 (Methodology v1.1), with the generated status fields removed (1.0.1), that adoption recorded in the file (1.0.2), and its public form (1.0.2-public, internal notes removed, every check unchanged). Verdict of record: the one `node verify.js` prints; on 27 Oct 2026 it is **PROVABLY FAIR — Full Pass** (23 of 23
scored checks PASS, 0 FLAG, 0 FAIL; the committed record and RELEASE-MANIFEST.json count
22 passes because they leave out ROAD-27, the check that compares the record with the run). Two branches are declared
unwitnessed and their checks pass, as the profile's rules allow: ROAD-31 (the 24-hour rule's "with none" branch was never
produced by the capture, DL-7) and ROAD-14 (the max-win branch was never reached, DL-10). The verdict is bound to the framework profile, shipped as `profile/profile.json` (sha256 checked
at run time): a run in which a scored check of that profile records no status, or whose step list or policies depart from it
(`src/profile-map.ts`), prints INCOMPLETE and exits 3, unless a check also FAILs, which ranks first (exit 1). The rule's timing is reported below as an observation, not scored.
Framework 1.1 (Methodology v1.1, 14 Oct 2026): RTP-CLAIM 1.2.0 is switched on, so an RTP figure overstated on the
house side is reported as **RTP FIGURE OVERSTATED** (exit 5), never NOT PROVABLY FAIR. That holds in code, including when
the game itself pays less than the figure: the published figure is read from the exhibits at run time (no constant holds
it), ROAD-19 takes its status from the rule alone, and the Pass 1 simulation (ROAD-20) is tested against each cell's exact
derived RTP; mutations M19b and M19c end RTP FIGURE OVERSTATED, exit 5. Exit codes under
[Reproduce the audit](#reproduce-the-audit).

## Contents

[Conclusion and scope](#conclusion-and-scope) · [Dataset and capture](#dataset-and-capture) ·
[Game and algorithm](#game-and-algorithm) · [Payouts and RTP](#payouts-and-rtp) ·
[Verification results](#verification-results) · [Player verifiers](#player-verifiers) · [Reproduce the audit](#reproduce-the-audit) · [Evidence](#evidence) ·
[Limitations and trust](#limitations-and-trust) · [Release history](#release-history)

## Conclusion and scope

Every scored Hubie's Road round recomputes exactly from its revealed server seed under the algorithm HouseBets publishes:
the 7,600 rounds of the 13 Oct phases and the 66 records of the 12 Oct file recorded whole (one 12 Oct round, resumed after
the capture re-sent a step request many times, is not replayed; it is in the account reconciliation). Recomputed: the trap
slots in the order the server lists them, the first deadly lane, the outcome of every lane walked, every intermediate
multiplier and value, every offer shown before a lane (next multiplier and value), and the payout. The 7,600 scored rounds
of 13 Oct appear in the platform's own bet history with the same stake and payout (E04); the 12 Oct file is reconciled by
its totals (E05). The draw is within 2^-32 of uniform on every range the game uses (worst deviation 2.1913 × 10^-10), and
the published flat 99 % RTP holds exactly for the multiplier formula in all 81 stopping cells (paid amounts are rounded down
to 1e-8, which costs at most 4.20 × 10^-7 at the 0.02 stake).

Pass 2 replays every revealed seed of every dataset (160) over 10,000 nonces. The scored early-window statistic (the
per-slot standardised return of all 7,667 played slots) shows no significant deficit: z −0.658, one-sided p 0.2553 at
level 0.008; it detects a uniform deficit of 1.39 pp per round at 80 % power. Printed per difficulty and not scored (four
subsets, no multiplicity correction), the daredevil slots are at z −2.045 (one-sided p 0.0204) and the easy slots at
z −0.751 (p 0.2264), both on the house side; medium (z 0.497) and hard (z 1.008) are on the player side (DL-6).

**Theoretical RTP is 99.0000% across all 81 (difficulty, lanes) formula cells, before rounding and before the max-win
cap**: the multiplier formula × the survival probability counted from the combinatorics is exactly 99/100 in each (ROAD-18,
ROAD-19), before each payout is rounded down to 1e-8; at a large enough stake the max-win cap stops a round before its
deepest lanes, so not every cell is a stop a player can reach at every stake. The survival probability is the count with every trap layout equally likely; the published draw map is within 2^-32 of equal at each pick and not exactly equal (ROAD-08, worst deviation 2.1913 × 10^-10), and that difference is not carried into the figure. The observed return of the 6,500 Phase A rounds, 98.44%, illustrates variance only.

The dataset comes from a single test account in a logged-in browser session. Apart from two deliberate negative tests (an
empty client seed, E06; a cash-out with no lane crossed, sent twice)
the capture sent no adversarial request to the API (DL-12); the fairness-integrity tests, run separately on HouseBets'
running service by ProvablyFair.org, are in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity
Testing). No
external randomness beacon participates, so seed selection by the operator before commitment remains residual trust; Pass 2
found no evidence of it. These are scope boundaries, recorded under [Limitations and trust](#limitations-and-trust).

Scope: HouseBets House Games **Hubie's Road** on the October 2026 engine (`road`, fairness version `canonical`), the USDT
wallet, all four difficulties, auto bets (lanes named up front: one lane in every scored 13 Oct auto bet; 2 to 24 lanes in
10 server-settled auto bets of 12 Oct, ROAD-17) and lane-by-lane play. Not in scope: other House Games
(their own packages), the security of the platform, the free round (stake 0, DL-8), and anything a client-side capture
cannot reach.

## Dataset and capture

| file | what | rounds | seeds |
|---|---|---|---|
| `data/housebets-road-phaseA-auto1-6500rounds.json` | **Phase A, primary**: 130 whole seed pairs of exactly 50 rounds, 0.02 USDT, one lane named up front; each difficulty 1,625 times; 13 Oct 2026 | 6,500 | 130 |
| `data/supplementary/housebets-road-phaseC-elevated-150rounds.json` | **Phase C**: easy, one lane, stake 2 (100 × the Phase A stake), 13 Oct | 150 | 3 |
| `data/supplementary/housebets-road-phaseC-elevated-10usd-150rounds.json` | **Phase C, $10 set**: same configuration at 10, 13 Oct | 150 | 3 |
| `data/supplementary/housebets-road-phaseD-playerseeds-200rounds.json` | **Phase D**: one auditor-typed client seed per pair, 0.02, 13 Oct | 200 | 4 |
| `data/supplementary/housebets-road-phaseE-multistep-600rounds.json` | **Phase E**: lane-by-lane rounds, 150 per difficulty, 13 Oct | 600 | 12 |
| `data/supplementary/housebets-road-full-67rounds-withopen.json` | the 12 Oct capture (pairs of 10 rounds): manual, auto and negative-test rounds, the round left open on purpose and the server's close of it 25 h 9 m 22 s after the last decision; 66 of its 67 records are recomputed round by round (DL-9) | 67 | in ROAD-01's 160 |

The capture ran inside a logged-in browser tab on an account opened for the audit, placing rounds through the game's own API
calls. For every seed pair it read the pair (the hash of the server seed and the hash of the next one), drew the client
seed from `node:crypto randomBytes(16)` after reading the hash, except on the 4 Phase D pairs, whose client seeds were chosen before the capture (DL-1), played 50 rounds, read the server's nonce count, and
rotated, which reveals the server seed. A pre-capture read anchors each dataset's chain before its first pair, and a read
after the last rotation closes it.

**Account identity (13 Oct 2026).** No field in this package carries the audit account's user id. The Hubie's Road answers
the capture recorded have no user-id field, and a search of every shipped file for the account's id finds 0 occurrences, so
nothing was replaced or redacted. The shipped datasets are byte-identical to the as-captured files (same sha256 as in the
HouseBets workshop).

**Every Hubie's Road bet of the account's 12–13 October capture is in this package.** E05's road rows sum to 7,667 rounds, the
rounds of this package's six files (7,600 scored on 13 Oct + 67 in the 12 Oct file; ROAD-16). E05 attributes the account's
other entries to the other games' files and to 13 entries from 10 Oct, whose games E05 does not name: the statement above is about the capture, not about those 13 earlier bets. No same-engine road capture is held back.

## Game and algorithm

From HouseBets' published spec (E01, `GET /housegames/road/fairness`):

- **Draw.** `block_b = HMAC-SHA256(key = serverSeed as UTF-8, message = "clientSeed:nonce:b")` for b = 0, 1, …; the blocks
  are concatenated, and trap i (i = 0, 1, …) reads bytes 4i..4i+3 of the concatenation, big-endian, as `u` (daredevil's 10
  traps use blocks 0 and 1); trap i is the slot at position `floor(u × (25 − i) / 2^32)` among the slots not yet picked,
  kept in ascending order. A difficulty of m traps is the first m picks; the server's `field` lists them in that
  draw order and matched it on every round (ROAD-07). The spec's six worked examples recompute (ROAD-09).
- **Lanes.** "Lane L (1-based) is deadly iff slot L − 1 is a trap; slots at or past the lanes count lie behind the castle
  gate and are never walked." Difficulties: easy 1 trap / 24 lanes, medium 3 / 22, hard 5 / 20, daredevil 10 / 15. The
  server's `trapLane` equals the first deadly lane derived on 7,666 of 7,666 replayed rounds (13 Oct and 12 Oct, ROAD-07).
- **Commitment.** The hashed server seed shown before the rounds is `sha256` of the seed's UTF-8 text (160 of 160 revealed
  seeds, ROAD-01); each pair also shows the hash of the next seed, and every chain of the 13 Oct phases links (ROAD-02).
- **Nonces** start at 1 on a fresh pair and count every round (ROAD-04).
- **Bias.** For every range n = 16 … 25 the map gives each position ⌊2^32/n⌋ or ⌈2^32/n⌉ of the 2^32 values of `u`; worst
  deviation from 1/n is 2.1913 × 10^-10 (n = 17), below the profile's 2^-32 ceiling (ROAD-08). No modulo step, no rejection.
- **Rules** (E01, verbatim): "a trap ends the round and pays nothing"; "after at least one safe lane the round can be cashed
  out; crossing the last lane reaches the castle and cashes out by itself"; "a bet may name a number of lanes to walk: they
  are stepped in order and a round that meets no trap is cashed out at once"; "a round never pays more than its max win
  above the stake: a step that would take the cash-out value past it is not taken"; "a round left without a decision for 24
  hours is finished by the server: with lanes crossed it is cashed out at its value; with none, one lane is walked and, if
  it is safe, the round is cashed out".

## Payouts and RTP

- **Multiplier** after k safe lanes with m traps = 99/100 × C(25, k) / C(25 − m, k) (E01 "multiplier"; the published table of
  all 81 values matches, ROAD-09). The server's `multiplier` field is the nearest binary64 to that exact fraction: 5,932 of
  5,932 winning settles and 2,194 of 2,194 intermediate lanes (13 Oct and 12 Oct, ROAD-13). Every multiplier exceeds 1 and
  rises strictly with lanes and with trap count (ROAD-14).
- **Offers.** Before every lane the game shows the next lane's multiplier and value (`next`). Both equal the formula at the
  next lane, and cash-out is offered exactly when a lane is crossed: 2,844 of 2,844 answers (Phase E and 12 Oct, ROAD-17).
- **Payout** = stake × the exact fraction, rounded down to 0.00000001 once (E01); exact on 7,665 of 7,665 rounds that
  settled by a decision (ROAD-11, ROAD-12); the round the server finished under the 24-hour rule is scored in ROAD-31.
  Every amount the server sent is on the 1e-8 grid: 7,666 of 7,666 rounds (ROAD-11).
- **Win probability** = C(25 − m, k) / C(25, k), checked equal to the product form in exact integers for all 81 cells (ROAD-18).
- **RTP.** HouseBets states the return in three places in our evidence, all read in the game's answers or code, none on a
  rendered page (DL-11): in the game settings the site loads, the fairness answer "99% for every difficulty and every
  stopping rule" (E01 "return"; the road bundle requests it, `jt("/"+rq+"/fairness")` then `setFairnessSpec`, in the bundle
  E02 cites, sha256 d9ba3797…, which the live page is inferred to load); and in the rules panel of that bundle, "(1% house
  edge)" and the multiplier "0.99 × C(25, k) / C(25 − m, k)" (E02 rulesRoadReturn, as literal text beside the `{pct}%` the
  page fills at run time). HouseBets reworded that line after the capture: the live copy of the same bundle (fetched 19 Oct
  2026, last-modified Fri, 16 Oct 2026 09:18:09 GMT) reads "Theoretical RTP before rounding and any payout cap: {pct}% (1%
  house edge). A capped payout can reduce the return." before the same multiplier sentence (E08 rulesRoadReturn). ROAD-19
  reads all three figures from the exhibits at run time and holds the game to the highest (all 99 %). For the multiplier formula,
  C(25 − m, k)/C(25, k) × 99·C(25, k)/(100·C(25 − m, k)) = 99/100 in every one of the 81 cells
  (`outputs/rtp-claim-table.json`, RTP-CLAIM 1.2.0, switched on: ROAD-19 PASS). Paid amounts are rounded down to 1e-8, which costs a 0.02 stake at most
  4.20 × 10^-7 of RTP (easy, 2 lanes).
- **Simulation.** Each of the four difficulties has 1,000,000 rounds on its own seeds (4,000,000 rounds; the stopping
  depths of one difficulty are settled on that difficulty's rounds). All 81 cells land within 5·SE + 1e-4 of the cell's
  exact derived RTP, 99/100 in every cell, never the published figure (worst 2.99 SE). The band's half-width runs from
  1.110 × 10^-3 (easy, 1 lane) to 8.950 (daredevil, 15 lanes); in 44 of the 81 cells it is wider than the 1 % house edge,
  so in those cells the band could not detect an edge of that size from this sample (ROAD-20). Live-round returns are
  variance only; RTP evidence is the exact table and the simulation.
- **Observed return** (variance, not RTP evidence): Phase A 127.97775 paid on 130 staked, **98.44%**; Phase C 301.125 on 300
  (100.38%), the $10 set 1,485 on 1,500 (99.00%), Phase D 3.81225 on 4 (95.31%), Phase E 10.99719038 on 12 (91.64%). A live
  sample of this size cannot confirm or reject a 1 % edge; the RTP evidence is the exact table and the simulation.

## Verification results

`node verify.js` runs the 31 checks of the framework's ROAD profile 1.0.2-public, shipped as `profile/profile.json` (a byte
copy of the framework's `games/road/profile.public.json`, sha256 e4c4bfef…, committed in the framework at 19f8dc7, 27 Oct
2026: the public form of 1.0.2, every check's id, name, layer, kind, policy and rule unchanged). verify checks that sha256, takes the scored list and every
policy from that file, and requires `src/profile-map.ts` to carry the same rows. 17 Nov 2026, Node 22: 23 of 23 scored checks PASS, 0 FLAG,
0 FAIL; ROAD-22 informational; package checks 7 of 7 PASS; verdict **PROVABLY FAIR — Full Pass**. The full
per-check output is `outputs/verification-results.json`. That record holds every check of the run except ROAD-27, ROAD-28 and ROAD-29, which attest the record itself: ROAD-27 compares it with the run, and ROAD-28 and ROAD-29 read the gate records (`outputs/fresh-copy.json`, `outputs/mutation-results.json`), which are bound to a code fingerprint that includes the record; verify prints those three and does not record them.

Status is the one `node verify.js` prints: PASS, FLAG (capture: a capture-origin FLAG), GAP (a package check not met), INFO
(informational, never in the verdict). Where a row holds two or three checks, the statuses are in the same order.

| check | status | result |
|---|---|---|
| ROAD-01 seeds | PASS | 160/160 revealed seeds hash to their commitments (130 Phase A); 6/6 pre-capture reveals |
| ROAD-02 chain | PASS | A 129/129 links, C 2/2, C $10 2/2, D 3/3, E 11/11; each anchored before its first pair and closed by the pair active after it |
| ROAD-03 / 04 | PASS · PASS | every pair: one hash and client seed; nonces exactly 1..50, N == the server's count; 7,600/7,600 rounds at nonce = count + 1 (12 Oct 66/66); every server answer of a round (bet, each action, game_detail) carries the same hash, client seed, nonce and round id as the settled block the recompute uses, and the capture's own copies (round id, seed and hash read before the round, outcome label) agree: 7,666/7,666 rounds |
| ROAD-05 population | PASS | 6,500 / 130 / 130 × 50 against code constants; C 150, C $10 150, D 200, E 600, all whole pairs of 50 |
| ROAD-06 client seed | PASS | a wrong client seed changes 6,428/6,500 fields (72 identical, 65.12 expected, the 1-trap easy fields); Phase D 200/200 recompute under 4 player seeds; empty seed refused (E06) |
| ROAD-07 / 10 / 11 | PASS · PASS · PASS | fields in draw order 7,600/7,600 (13 Oct) and 66/66 (12 Oct); trap lanes and outcomes 7,666/7,666; payouts 7,665/7,665; every amount on the 1e-8 grid; Phase A wins crossed exactly lane 1, traps hit lane 1 |
| ROAD-08 | PASS | bias ≤ 2^-32 (worst 2.1913 × 10^-10) |
| ROAD-09 (package) | PASS | E01's 6 worked examples (field and first deadly lane) and its 81 published multipliers recompute, and so does captured round 0; also `tests/rng.test.ts` |
| ROAD-12 | PASS | Phase C 150/150 (146 wins) and the $10 set 150/150 (144 wins) recompute and pay by the base rule |
| ROAD-13 / 14 | PASS · PASS | multipliers exact as binary64 on 5,932 settles and 2,194 lanes; monotone and > 1 in all 81 cells; no win above the max win; 0 auto stops at the cap and 0 of the 10,509 request answers offered a max-win stop, so the cap branch is declared unwitnessed (DL-10), which the rule allows |
| ROAD-15 | PASS | 4/4 difficulties × 1,625; Phase E depths at settle: easy 23 distinct (deepest 24, the castle), medium 14, hard 12, daredevil 7 |
| ROAD-16 | PASS | 7,600/7,600 scored 13 Oct rounds in the platform's bet history with the same stake, payout and status (E04); E05 checked by its numbers: 60 dataset rows sum to its TOTAL, the ledger line adds up (86,979 = 86,966 + 0 + 13), balance after − net + open == 986.84718000; each of the 6 package files' rows (rounds, staked, paid) == the package's own sums (12 Oct: 67 rounds); E05's road rows 7,667 == this package's rounds; the pass rests on that bet history and that account reconciliation: the comparison of consecutive balances the profile describes was not possible in this capture (DL-3) |
| ROAD-17 | PASS | Phase E 600/600: lane values, safe and deadly steps, cash-outs, trap-set invariance, and every offer shown before a lane (2,844/2,844 answers with 12 Oct); 10 server-settled auto bets naming 2 to 24 lanes (12 Oct) replay from the derived field; "auto == lane by lane" is computed by the package, not a server answer |
| ROAD-18 / 19 | PASS · PASS | survival probability from combinatorics, negative control rejected; RTP exactly 99 % in every cell, against the 99 % read at run time from E01 "return", E02 rulesRoadReturn "(1% house edge)" and its 16 Oct rewording E08 |
| ROAD-20 | PASS | 4 difficulties × 1,000,000 rounds, each on its own seeds: 20 uniformity tests, smallest p 9.169 × 10^-2 (Bonferroni bar 1.250 × 10^-4); lag-1 z 0.199, runs z 0.381; 81/81 RTP cells in band (half-widths and the 44 cells wider than the edge above) |
| ROAD-21 | PASS | every revealed seed of every dataset, 160 (A 130, C 3, C $10 3, D 4, E 12, 12 Oct 8), × 10,000 nonces, each nonce replaying a round the capture played on that seed; scored per-slot standardised return over the 7,667 played slots: early-window z −0.658, p 0.2553 at level 0.008 (reference window z −0.323); per dataset, printed: A −0.658, C 0.833, C $10 0.000, D −1.008, E 0.061, 12 Oct −0.241; per difficulty over every seed, printed, not scored: easy z −0.751, medium 0.497, hard 1.008, daredevil −2.045; the pooled Phase A return scored until 14 Oct: z −0.865, p 0.1936; 69 Phase A pairs below expectation, 61 at or above; power: a 1.39 pp per-round RTP deficit at 80 % (DL-6) |
| ROAD-22 (info) | INFO | first trap slot chi² p 0.888; lane-1 traps per difficulty: easy 79 (65.0 expected), medium 182 (195.0), hard 301 (325.0), daredevil 690 (650.0) |
| ROAD-23 (package) | PASS | the S5 matrix below carries the framework's eight rows, ids and names in order, each with a result and what it is tied to; verify checks the ids and the names, not a count |
| ROAD-24 (package) | PASS | `site-verifier/derive.js`, sha256 `6ac09752e8745ea18a9b34b9bbfb26d93f185d55e42788b7f3ae213bcde25e84`, generated from `src/rng.ts`: equals its pins (`src/artifact-pins.ts`, RELEASE-MANIFEST.json) and returns what `src/rng.ts` returns on all 7,666 rounds ROAD-07 replays (38,491 calls, 0 differing results; [Player verifiers](#player-verifiers)) |
| ROAD-25 (package) | PASS | README "Verify a bet": save the hash first, reveal, fields, commitment encoding, HMAC key encoding, trap picks with their block index, lane numbering, multiplier, and a script that recomputes a round |
| ROAD-26 / 27 | PASS · PASS | 6 datasets, 8 exhibits and 3 artifacts match their pins; MIN_STAKE and MAX_WIN equal E03, the multiplier coefficient 99/100 equals E01 "multiplier" and E02 rulesRoadReturn, the slots, difficulties, six worked examples and 81-cell multiplier table in `src/spec.ts` equal E01, and the published return parses from E01 and E02 (a constant that departs from its exhibit is a FAIL); regenerated census and RTP table == committed; verify.js is bundled from the sources on disk (a stale bundle fails ROAD-27) |
| ROAD-28 / 29 | PASS · PASS | read only the committed, RELEASE-MANIFEST-pinned records `outputs/fresh-copy.json` and `outputs/mutation-results.json`, each carrying the fingerprint of the code and data it ran against (`scripts/fingerprint.mjs`); a record that is missing, edited or unpinned prints FAIL and fails the verdict (exit 1); one from other code is a GAP. ROAD-28: the fresh copy reproduces the verdict and its exit code, audit ID PF-2026-HB11; ROAD-29: 50/50 mutations killed by their named check |
| ROAD-30 (package) | PASS | 12 declared-limitation rows, the load-bearing premises with "Could the data contradict it?", every exhibit E01…E08 listed by file name |
| ROAD-31 | PASS | the abandoned round recomputes and was settled on the witnessed "lanes crossed" branch at exactly its value (E07); the "with none" branch was not exercised by the capture and is declared unwitnessed (DL-7), which the rule allows |

**Pass 2 and the per-seed count.** Another ProvablyFair.org audit's Pass 2 counts the seeds that are off in their windows one by
one (its Tests A and B and the seeds off in both windows); the ROAD profile's -21 rule asks for the return of the
difficulties and depths the casino served in each epoch, against their exact per-config mean and variance, which this
package sums over every played slot into one standardised z. They are two tests of the same question, one aggregate
statistic here and a count of individually anomalous seeds there, and each states its own false-alarm rate.

### False-alarm rates

Pass 1 has four screens, each held to α/4 = 0.0025: uniformity (Bonferroni over 20 tests), lag-1 and runs, and the RTP
cells, whose exact binomial false-alarm rates sum to 3.9 × 10^-4 over all 81 cells — so ROAD-20 as a whole is at most 1 %.
Pass 2 runs at level 0.008, not 0.01: at 0.01 the pooled rule's rate measured 0.00998 ± 0.000222, indistinguishable from
the cap, so the level was set to 0.008; no artifact in the package records when that was decided relative to the live
statistic. At 0.008 the scored per-slot standardised rule's rate over the 7,667 played slots of every revealed seed is
0.00812 ± 0.000201, and the pooled rule's (scored until 14 Oct, on the 6,500 Phase A slots) 0.00793 ± 0.000198
(`src/false-alarm-pass2.ts`; `npm run false-alarm:pass2` prints all three, 200,000 replicates each). All under the 1 % cap
for a failing step.

### Observations (not scored)

- **24-hour rule timing.** The round left open on purpose on 12 Oct 2026 (easy, 1 lane crossed, value 0.020625) was still
  active at the capture's checks 24.02 h, 24.59 h and 25.038 h after it was left, and was finished by the server at
  2026-10-13T14:54:22.655582Z, 25 h 9 m 22 s after its last decision. ROAD-31 scores the witnessed settlement (cashed out at exactly
  its value, as published) and declares the unwitnessed branch; the rule says 24 hours and the close came 1 h 9 m 22 s later. The ROAD profile sets no bound on the
  timing; it is reported as observed.
- **Cash-out with no lane crossed**, sent on purpose twice on 12 Oct: refused both times, HTTP 400 code 6 "cross a lane
  before cashing out".
- **One round re-sent by the capture** (12 Oct, round `db0286ad…`, DL-9): the capture re-sent the bet's own generation id
  with 682 step requests; 681 were answered with the bet answer itself, nothing walked and no second round, and 1 recorded
  no answer. On resume, two requests under new generation ids walked one lane and cashed out; the round is counted in the
  reconciliation (ROAD-16).

### Framework S5 matrix and offline checks

S5 level: the framework's fairness-integrity matrix.

<!-- S5-MATRIX:BEGIN -->
| Test ID | Category | What the framework tests | Result | Tied to |
|---|---|---|---|---|
| S5-1 | Replay protection | A completed bet ID cannot be replayed to duplicate a payout | Pass | HB-ROAD-REPLAY-001, HB-ROAD-IDEMP-001: Of two identical bet requests sent in parallel, one was accepted and debited and the duplicate refused before any debit; a bet replayed with the same request key, with its round open and again once closed, returned that round with no second debit. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no replay of a completed round was sent. Observed only: the 682 step requests the capture re-sent with an open round's own generation id were answered with the bet answer, nothing walked and no second round (observation above, DL-9); every captured round settled once, with one payout (ROAD-11, ROAD-16). DL-12 |
| S5-2 | Input validation | Invalid, out-of-range or malformed parameters are rejected | Pass | HB-ROAD-PARAM-001, HB-ROAD-SEED-001: Case and whitespace variants, unknown names, numbers and wrong types sent as the difficulty were rejected; client seeds longer than 60 characters and a whitespace-only seed were refused. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: the capture sent only valid difficulties, lane counts and stakes. Observed only: an empty client seed, sent once on purpose, was refused, HTTP 400 (E06). DL-12 |
| S5-3 | Seed integrity under adversarial input | Server and client seed fields cannot be injected or overridden via the API | Pass | HB-ROAD-MAXWIN-002: A bet carrying injected nonce, payout, multiplier, value, layout and seed fields was rejected at validation and nothing was reflected; the control bet settled as published and recomputed from the revealed seed. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no injection was attempted. Observed only: every server answer of a round carries its pair's committed hash and client seed (ROAD-03), and the 4 player-set Phase D seeds are the ones the fields recompute with (ROAD-06). DL-12 |
| S5-4 | Cross-player isolation | One player's seeds, nonces or outcomes are not observable or influenced by another | Pass on 1 of 2 controls; 1 not tested | HB-ROAD-AUTH-001, HB-ROAD-AUTH-002: Bets carrying foreign and malformed user identifiers were rejected, and every step and cash-out a second account sent against an open round of the first was refused as not found; the round stayed intact and the second account's balance did not move. Not covered: observation by another account was not tested. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: single test account (EC-9). DL-12 |
| S5-5 | Payout field integrity | Client-supplied payout or multiplier values are ignored by the server | Pass | HB-ROAD-MAXWIN-002: A bet carrying injected nonce, payout, multiplier, value, layout and seed fields was rejected at validation and nothing was reflected; the control bet settled as published and recomputed from the revealed seed. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: the capture never sent a payout or multiplier field. Observed only: every payout equals the stake × the formula multiplier, rounded down to 1e-8 (ROAD-11, ROAD-13). DL-12 |
| S5-6 | Nonce sequence enforcement | Nonces cannot be forced, replayed or skipped via the API | Pass | HB-ROAD-NONCE-001, HB-ROAD-NONCE-002, HB-ROAD-NONCE-003, HB-ROAD-NONCE-004, HB-ROAD-RACE-001, HB-ROAD-MAXWIN-002: Bets carrying reused, skipped-ahead, zero, negative and overflow-sized nonces, or an injected nonce field, were rejected at validation and only the control and recovery bets advanced the nonce; under bursts of parallel bets exactly one bet per burst was accepted and accepted nonces were unique. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no nonce was supplied by the client. Observed only: nonces run 1..50 with no gap, repeat or reorder in every 13 Oct pair, and each round's nonce is the server's count before it + 1 on 7,600/7,600 rounds (ROAD-04). DL-12 |
| S5-7 | Parameter boundary enforcement | Bet amounts, configuration values and game parameters outside valid ranges are rejected | Pass on 1 of 2 controls; 1 not tested | HB-ROAD-MAXWIN-001: Stakes far above the maximum, positive stakes far below the floor, over-precise stakes and negative stakes were rejected. Not covered: no test sent a configuration value or game parameter outside a range (the difficulty is a name, not a ranged value: S5-2). Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no out-of-range difficulty, lane count or stake was sent. Observed only: no captured round came near the max win, so the max-win stop was never reached (ROAD-14, DL-10). DL-12 |
| S5-8 | Game-specific state | For Hubie's Road: walking a lane after a loss, cashing out with no lane crossed | Pass on 1 of 2 controls; 1 not tested | HB-ROAD-REPLAY-002: Steps sent against an unknown round and against a settled round were refused. Not covered: a cash-out with no lane crossed was not tested; the step was sent against a settled round. Report, Section 5 (Fairness Integrity Testing). This package's own capture, separately: no step after a loss was attempted. Observed only: a cash-out with no lane crossed, sent on purpose twice, was refused both times, HTTP 400 code 6 (observations above); every trap ends the round on its first deadly lane and pays 0 (ROAD-10). DL-12 |
<!-- S5-MATRIX:END -->

Of the eight framework rows, **5 pass on every control the row names**, **3 pass on part of the controls they name** (S5-4,
S5-7, S5-8: the row's status says how many of its controls were tested, and its evidence cell what was not) and none remains
Not tested. The passing rows rest on fairness-integrity tests run separately on HouseBets' running service by
ProvablyFair.org; they are recorded in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity Testing),
not in this package's data, so nothing in this package reproduces them. The matrix names 14 of that section's 28 tests, each
under the row whose control it tests; the other 14 tests check controls outside these eight rows and are in the report only.
This package's own capture recorded normal play, two deliberate negative tests (an empty client seed; a cash-out with no
lane crossed) and one round its own fault re-sent; it sent no other adversarial request. The "Observed only" notes state
what the captured data shows; none substitutes for the adversarial test, and reproducing a test from this package needs a
deliberate probe capture (DL-12).

The nine offline consistency checks are this audit's own ids, not the framework's S5 rows:

| Check | Category | What was tested | Result | Finding |
|---|---|---|---|---|
| EC-1 | Commitment integrity | Seed substitution: can a revealed seed be swapped for a better one that still matches the commitment? | Pass | 160/160 seeds hash to their commitments and every chain links in order from a pre-capture anchor; these are consistency checks, the timing rests on the capture's reads before each pair (P-1). ROAD-01, ROAD-02 |
| EC-2 | Player influence | Client-seed manipulation: does the client seed enter the derivation? | Pass | 6,428/6,500 fields change under a wrong client seed (72 identical, 65.12 expected by chance, the 1-trap fields); Phase D 200/200 recompute under player-set seeds and 200/200 differ from the previous seed's fields. ROAD-06 |
| EC-3 | Payout integrity | Stake-conditional outcome: do the captured higher-stake rounds recompute and settle by the same rule as the base stake? | Pass | 150 rounds at 2.00 and 150 at 10.00 recompute and pay by the same rule as 0.02; the derivation takes no stake input. ROAD-12 |
| EC-4 | Commitment integrity | Server-seed cherry-picking: can the operator pre-select seeds unfavourable for the early nonces? | Pass | Structural only for a client seed the player sets after the hash is shown, as the capture did on 156 of 160 pairs (P-1); the 4 Phase D client seeds were chosen before the capture (DL-1), so the structural argument does not cover those pairs, which are in the Pass 2 screen. The account's first client seed, `RYaoMy2SjYKm` in the pair read before the 12 Oct capture, was not set by the capture, and who generates HouseBets' default client seed was not checked. No captured bet was played on that pair and it is not among the pairs Pass 2 replays, so play on the default client seed was outside this test: neither the structural argument nor the Pass 2 result says anything about it. Statistical, for the captured pairs only: Pass 2 over all 160 revealed seeds (156 with a client seed the capture generated, 4 with one the auditor typed) × 10,000 nonces, scored per-slot standardised return z −0.658, p 0.2553; power 1.39 pp per round spread over all slots, 6.59 pp on the 1,833 daredevil slots alone, whose own z is −2.045 (printed, not scored; DL-6). ROAD-21, ROAD-06 |
| EC-5 | Seed lifecycle | Seed-rotation race: can a rotation during an open round change its seed? | Not tested | Every round's settled fairness block carries the pair it was opened under (ROAD-03), but no rotation was sent while a round was open |
| EC-6 | Payout integrity | Multiplier tampering: is any win, lane or offer at a multiplier other than the published formula's? | Pass | Recomputed from (m, k) alone and compared with the served multiplier: 5,932/5,932 settles, 2,194/2,194 lanes, 2,844/2,844 offers shown before a lane; payouts exact. ROAD-13, ROAD-11, ROAD-17 |
| EC-7 | Nonce integrity | Nonce manipulation: are nonces skipped, reused or reordered? | Pass | Every pair of the 13 Oct phases (A 130/130, C 3/3, C $10 3/3, D 4/4, E 12/12) runs exactly 1..50 with the server's count equal to 50; every server answer of a round carries the same nonce. ROAD-04 |
| EC-8 | RNG integrity | Range-mapping bias: does the draw-to-slot map favour some slots? | Pass | Counted over the 2^32 inputs from the two ends of each outcome's interval (the ends checked through the function; the values between them are not enumerated) for every range 16 … 25: worst deviation 2.1913 × 10^-10. ROAD-08 |
| EC-9 | Scope limitation | Multi-account seed sharing | Not tested | Single test account |

## Player verifiers

The ProvablyFair.org verifier for HouseBets is at
[provablyfair.org/verify-bets/housebets](https://www.provablyfair.org/verify-bets/housebets). The module it runs for this
game ships in this release as `site-verifier/derive.js`, sha256
`6ac09752e8745ea18a9b34b9bbfb26d93f185d55e42788b7f3ae213bcde25e84`. The live verifier serves exactly these bytes.

**How the module is built.** `npm run build:site-verifier` (`scripts/build-site-verifier.mjs`, bun 1.3.9) bundles
`src/rng.ts` into one ES module with no import, which exports the same functions and constant under the same names
(`SLOTS`, `drawStream`, `firstDeadlyLane`, `hmacBlock`, `picks`, `positionFromU`, `sha256Hex`) and runs in a browser and in
Node. `src/rng.ts` takes SHA-256 and HMAC-SHA256 from Node; a browser page has no such module, so the build puts its own
implementation of the two inside the file. Nothing else differs from `src/rng.ts`. The same sources give the same bytes: the
file's header carries the sha256 of `src/rng.ts` and no date, host or path, the bun version is fixed, and
`node scripts/release-manifest.mjs --check` rebuilds the module in a throwaway folder and requires the shipped file to equal
the rebuild byte for byte.

**What ROAD-24 checks, on every run.** The file on disk has the sha256 pinned in `src/artifact-pins.ts`
(`SITE_VERIFIER_PIN`) and in RELEASE-MANIFEST.json, and this document and the README quote it. The module is then loaded
from that file and run side by side with `src/rng.ts` on every round ROAD-07 replays, with the seed, client seed, nonce,
trap count and lane count of each round: 7,666 rounds of the six shipped datasets (the 7,600 of the 13 Oct phases and the
66 records of the 12 Oct file recorded whole; the one 12 Oct record ROAD-07 does not replay is not replayed here either,
DL-9) and 160 revealed seeds, 38,491 calls over its six functions and one constant, 0 differing results. Two mutations
cover the check (`tests/mutations.json`): M24a changes the position formula inside the module (u × n to u × (n − 1)) and
re-pins it everywhere, so only the side-by-side run can catch it; M24b breaks the pin and leaves the module alone. To confirm
the bytes a page serves, compare the sha256 of the module it loads with the one above.

HouseBets' own fairness window was not tested (DL-4).

## Reproduce the audit

`node verify.js` on Node 22, or `npm test` on Node 22.6 or later, with nothing installed. Re-generation of the artifacts of record:
`npm run simulate` (the census, `outputs/simulation-results.json`), `npm run rtp-claim:write` (the RTP table),
`npm run record` (the verification record) — each re-pinned in `src/artifact-pins.ts` (and `src/rtp-settings.ts`) in the
same change, then `npm run build:site-verifier` (rebuilds `site-verifier/derive.js` from `src/rng.ts` and writes its pin) and
`npm run build:standalone` (verify.js; ROAD-27 refuses a bundle built from other sources, and a stale `verify.js` itself exits 4 with no verdict). `npm run
mutate` runs the mutation battery in throwaway copies and writes the committed record `outputs/mutation-results.json`;
`npm run gate:fresh` runs the package from a fresh copy and writes `outputs/fresh-copy.json`; `npm run release-manifest`
then pins both in RELEASE-MANIFEST.json (ROAD-28/29 read only those pinned records); RELEASE-MANIFEST.json pins every file
of the package except itself. `npm run false-alarm:pass2`
re-derives the Pass 2 false-alarm declarations.

A release-gate record that is missing or is not the bytes RELEASE-MANIFEST.json pins fails the verdict (exit 1), and every
mutant copy reads the fresh-copy record, so the records are regenerated in this order: `npm run build:standalone`,
`npm run gate:fresh`, `npm run release-manifest`, `npm run mutate`, `npm run release-manifest`. ROAD-24 reads the module's
pin from RELEASE-MANIFEST.json, so after a change of `src/rng.ts` these come first: `npm run build:site-verifier`,
`npm run release-manifest`.

`verify.js` is bundled by bun; the version that built it is written into its header and recorded in RELEASE-MANIFEST.json
as `toolchain.bun`. `node scripts/release-manifest.mjs --check` recomputes the manifest from the files on disk, rebuilds
`site-verifier/derive.js` from `src/rng.ts` (bun 1.3.9) and requires the shipped file to equal the rebuild, and prints
OK or STALE; on STALE it names the files that differ, and when `verify.js` is one of them it names the bun version that built
the release's bundle, the one that built the bundle on disk and this machine's. Another bun version can bundle the same
sources to different bytes (local names) with the same results, so a STALE that names only `verify.js` after a local rebuild
is that toolchain difference: compare the `VERDICT:` and `Reproduction` lines of `node verify.js` on both. `scripts/make-evidence.py` rebuilds `evidence/` from the HouseBets
workshop.

Exit codes of `node verify.js` / `npm run verify`, the same in all 11 HouseBets new-engine packages (the ranking of
RTP-CLAIM 1.2.0, `rtpClaimVerdict`): 0 PROVABLY FAIR — Full Pass · 2 PROVABLY FAIR — Conditional Pass · 5 RTP FIGURE
OVERSTATED · 3 INCOMPLETE · 1 NOT PROVABLY FAIR · 4 `verify.js` is a stale build of the sources beside it (no verdict). When
more than one applies: NOT PROVABLY FAIR > INCOMPLETE > RTP FIGURE OVERSTATED > Conditional Pass > Full Pass. A step that
throws (a missing file) is scored FAIL, the other steps still run, and the run ends NOT PROVABLY FAIR, exit 1. The mutation battery asserts
the exit code of the mutations that name one: M07x and M07y end 3, M19b and M19c end 5, M16c ends 2, M07z, M19 and M26b end 1.
`npm run gate:fresh` expects the committed record's verdict with that verdict's exit code.

## Evidence

| exhibit | file | role |
|---|---|---|
| E01 | `evidence/E01-road-fairness-spec-2026-10-13.json` | the server's published road spec (derivation, lane rule, difficulties, rules, multiplier, return claim, six worked examples, the 81-value multiplier table) |
| E02 | `evidence/E02-road-rules-panel-2026-10-10.json` | the rules panel text in the road bundle, with the bundle's hash; the live page's use of this bundle is inferred, not checked (DL-11) |
| E03 | `evidence/E03-road-limits-2026-10-13.json` | the limits answer: wallet minimum stake 0.01000311, max win 1,000,310.0961298 USDT, 8 decimals |
| E04 | `evidence/E04-road-bet-history-2026-10-13.json` | the platform's bet-history rows of the 7,600 scored 13 Oct rounds |
| E05 | `evidence/E05-account-reconcile-2026-10-13.txt` | the whole account's reconciliation, the full output of `python3 -I reconcile-full.py --ledger ledger/ledger-2026-10-13-final.json --before 986.84718000` (ends RECONCILED), re-run 13 Oct: 86,979 history entries = 86,966 captured rounds of the 11 games + 13 earlier bets, wallet exact, a row per dataset |
| E06 | `evidence/E06-road-empty-seed-control-2026-10-13.json` | the server's answer to an empty client seed: refused, HTTP 400 |
| E07 | `evidence/E07-road-abandoned-round-2026-10-13.json` | the round left open on 12 Oct, the capture's checks, the server's record of finishing it and its bet-history row |
| E08 | `evidence/E08-road-rules-panel-live-2026-10-19.json` | the same rules panel text in the live copy of the road bundle, fetched 19 Oct 2026 (last-modified Fri, 16 Oct 2026 09:18:09 GMT, sha256 and etag recorded), with every key changed since E02 (rulesRoadReturn reworded; Min bet / Max bet lines replace the bet-range line); the live page's use of this bundle is inferred, not checked (DL-11) |

**Capture code (`capture/`, reference copy).** `capture-hb-road.reference.mjs` (the game's capture script), `multistep-common.reference.mjs`
and `hb-capture-lib.reference.mjs` (the modules it imports) and `crypto-shim.reference.js` (the browser stand-in for
`node:crypto` the in-tab capture ran with). Comments are redacted for publication (names, quotes and internal paths
removed); the code is unchanged. The as-run game script, sha256 `f7c1ed68f6144f72881ae360b2bb206a76790b11ced7157eca757fdd30f11ec7`, the value every 13 Oct
dataset records as `meta.captureScript.sha256`, is held privately; the shipped copy is not that file. The 12 Oct file
records the version of the script used on 12 Oct (`0c966159…`), whose copy was not kept. No hash of the three other files was recorded at
capture, so their as-run copies are not identified. The copies are pinned in RELEASE-MANIFEST.json.

`scripts/make-evidence.py` records the source path and sha256 of each exhibit; `scripts/make-live-rules.py` builds E08 from the
live bundle copy of 19 Oct and stops unless its reading reproduces every key of E02 from the 10 Oct copy.

## Limitations and trust

### Load-bearing premises

| ID | Premise | Why it holds | Could the data contradict it? |
|---|---|---|---|
| P-1 | Each commitment was shown before its rounds. On the 156 of 160 pairs whose client seed the capture drew (every pair outside Phase D), the seed was drawn after the commitment was read; the 4 Phase D client seeds were chosen before the capture (DL-1), and each of their commitments was read before the pair's first round | The capture read the hash, then drew the seed, then played; read and draw times are logged per pair (148/148 in order, ROAD-06; the seed generator is the capture's own label, DL-1) | Partly: a commitment that did not match its revealed seed would fail ROAD-01; the order of reads is the capture's record, not the server's |
| P-2 | E01 (the server's own spec answer) is what HouseBets publishes for this game | It is the answer of the fairness endpoint the game's code calls | No: a different text on the rendered page would not show in the data (DL-11) |
| P-3 | The served `multiplier` field is the nearest binary64 to the exact fraction | Measured on every settle and lane (ROAD-13); the published text gives the fraction | Yes: one value at another rounding would fail ROAD-13 |
| P-4 | The account was used only by the capture | E05: the history holds the captured rounds and 13 earlier bets, nothing else | Yes: any other bet would be an unexplained history entry |

### Declared limitations register

| ID | Limitation | Effect | Closure / evidence |
|---|---|---|---|
| DL-1 | Phase D client seeds are predictable strings chosen by the auditor (`provablyfair-1`, `provablyfair-2`, `player-seed-abc`, `1234567890`) | All 4 Phase D pairs are exposed to an operator who could foresee them; Phase D tests recomputation, not unpredictability; Pass 2 replays them with every other revealed seed (ROAD-21) | Phases A, C, C $10 and E client seeds are labelled by the capture as `node:crypto randomBytes(16) hex` (148/148); the check is a label match. A redacted reference copy of the capture code is in `capture/` (the client seed is `csprngClientSeed` in `hb-capture-lib.reference.mjs`: a prefix and `randomBytes(16)` in hex, in the browser `window.crypto.getRandomValues`, `crypto-shim.reference.js`); the as-run game script is held privately, so the shipped copy shows the code, not proof of what ran ([Evidence](#evidence)) |
| DL-2 | Commitment timing rests on the capture's reads (P-1) | Hash equality is a consistency check | — |
| DL-3 | The per-round balance field cannot be checked round to round: the games were captured concurrently | Reconciliation uses the platform history (E04) and the account reconciliation (E05) instead | E05 RECONCILED; each package file's totals match its row |
| DL-4 | The player-facing reveal path and the hashed server seed were observed in the API and the game's code, not on the rendered fairness window | README "Verify a bet" steps 1 and 2 are scoped to that: they name the API fields, not a place on the screen | — |
| DL-5 | At 1,000,000 rounds per difficulty, 4 of the 81 RTP cells have under 30 expected surviving rounds (hard 20 lanes, daredevil 13, 14 and 15 lanes) | They are scored, but their band is wide and they carry little evidence; their exact RTP is 99 % by the table (ROAD-19) | — |
| DL-6 | Pass 2's scored statistic is, since 14 Oct, the per-slot standardised return of the played slots, and since 27 Oct its population is every played slot of every revealed seed (7,667 slots on 160 seeds), as the profile's -21 rule asks; until then it was the 6,500 Phase A slots. Both changes were made AFTER the earlier result was known: the switch from the pooled return after the pooled result, the widening after the Phase A result. All three are printed and all pass (standardised over every seed z −0.658, p 0.2553; Phase A alone z −0.658; pooled Phase A z −0.865, p 0.1936). Per difficulty over every seed, printed and not scored (four subsets, no multiplicity correction): daredevil z −2.045, one-sided p 0.0204, and easy z −0.751, p 0.2264, both on the house side; medium z 0.497 and hard z 1.008 on the player side. A deficit on the 1,833 daredevil slots alone is detectable at 6.59 pp per round | The daredevil figure's Phase A part is the fact ROAD-22 prints as 690 lane-1 traps against 650.0 expected; its one-sided p 0.0204 is above the 0.008 level even before the four subsets are counted, and the scored statistic shows no significant deficit | Of the 7,667 rounds Pass 2 covers, 7,666 recompute exactly from their revealed seed (ROAD-07); the one 12 Oct round resumed after the capture re-sent a step request is in Pass 2 but is not replayed (DL-9) |
| DL-7 | The 24-hour rule was observed on one round, the "lanes crossed" branch; the "with none" branch was not exercised, and the close came 25 h 9 m 22 s after the last decision | ROAD-31 passes: the witnessed branch settled by the rule and the rule lets a branch not exercised be declared unwitnessed; the timing is an observation | E07 |
| DL-8 | The free round (stake 0, E02 rulesRoadFreeRound) was not played | Not in scope | — |
| DL-9 | The 12 Oct capture file is played on pairs of 10 before the Phase A design, so it is not part of the population or pair-structure checks (ROAD-02, 04's pair rule, 05). Its 66 records recorded whole (the two negative tests and the 24 h round included) are recomputed round by round. One round is not replayed: the capture re-sent one step request many times with the same generation id (its own generation-reuse bug, stopped by the operator) and the round was finished on resume | That round is counted in the file's reconciliation row (E05: 67 rounds; ROAD-16 recomputes the row's totals from the server's settled round records) | — |
| DL-10 | No captured round came near the max win: 0 auto stops at the cap and 0 of the 10,509 request answers of the replayed rounds offered a max-win stop | The cap branch is declared, not measured; the "next lane offered" half is checked on 2,194 steps. ROAD-14 passes with the branch declared: its rule reads "the cap branch is witnessed in data or declared unwitnessed" | — |
| DL-11 | E02 is cut from the road bundle, which the live page is inferred (not checked) to load (bundles/LIVE-BUNDLES.md, 10 Oct 2026) | Every rule the checks score is taken from E01, the server's own answer; E02's stated house edge "(1% house edge)" (and E08's, the same bundle URL's 19 Oct copy) is one of the places ROAD-19 holds the RTP to, and its multiplier coefficient must equal E01's (ROAD-26) | — |
| DL-12 | This package's capture sent no adversarial request to the API, so its data cannot reproduce a fairness-integrity test | The tests behind the S5 matrix were run separately on HouseBets' running service by ProvablyFair.org and are recorded in the ProvablyFair.org report for this game, Section 5 (Fairness Integrity Testing), not in this package: all 8 rows Pass on them (5 on every control the row names, 3 on part); single test account. The two deliberate negative tests (an empty client seed, E06; a cash-out with no lane crossed, twice) and the round the capture re-sent are noted under S5-1, S5-2 and S5-8, and close no row | The S5 matrix under [Verification results](#verification-results) names the tests behind each row and states what the captured data shows. Reproducing a test from this package needs a deliberate probe capture |

## Terms

**G-BIND:** the framework's population rule (ROAD-05): the counts a dataset is checked against are code constants in
`src/loader.ts`, never the dataset's own header.

## Release history

**`v1.0.0`**: first public release, 24 Nov 2026. Verdict PROVABLY FAIR — Full Pass.

E05, the account's reconciliation, also lists 13 bets of 10 October 2026, placed before the capture; they are in no dataset
of this package.
