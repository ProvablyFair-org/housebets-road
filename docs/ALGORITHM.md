# HouseBets Hubie's Road: algorithm specification

Written 21 Oct 2026 for the ProvablyFair.org audit of HouseBets House Games **Hubie's Road** on the engine HouseBets serves
since October 2026 (API slug `road`, fairness version `canonical`).

HouseBets publishes this game's algorithm. This document restates it as one implementable specification and records,
for every step, where it comes from and what the capture measured. It is not a clean-room reconstruction: the steps are
the ones HouseBets publishes, and every formula below is the one this package computes (`src/rng.ts`, `src/rules.ts`).
Every step names its source:

- **PAGE**: HouseBets' own published text. E01 is the server's fairness answer, `GET /housegames/road/fairness`
  (`evidence/E01-road-fairness-spec-2026-10-13.json`, read 13 Oct 2026). E02 is the rules panel of the road bundle of
  10 Oct 2026 (`evidence/E02-road-rules-panel-2026-10-10.json`). E08 is the same panel in the live bundle of 16 Oct 2026
  (`evidence/E08-road-rules-panel-live-2026-10-19.json`). E03 holds the wallet limits.
- **CODE**: this package's implementation of the step, `src/rng.ts` or `src/rules.ts`.
- **DATA**: the scored check of `node verify.js` that holds the step against the captured rounds (ROAD-xx). The capture
  is 7,600 rounds of 13 Oct 2026 (phases A, C, C $10, D, E) and the 66 whole-round records of 12 Oct 2026; see
  [MANIFEST.md](../MANIFEST.md#dataset-and-capture).

---

## 1. Inputs and commitment

### 1.1 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | text string, secret until the pair is rotated; 64 lowercase hex characters in every captured pair | PAGE: E01 `derivation` ("key = serverSeed"). DATA: 160 revealed seeds (ROAD-01) |
| `clientSeed` | text string set by the player | PAGE: E01 `derivation`. DATA: capture seeds, and four auditor-typed seeds in Phase D (ROAD-06) |
| `nonce` | integer ≥ 1; 1 on the first round of a fresh pair, +1 per round | DATA: nonces exactly 1…50 in every pair, and each round's nonce = the server's count before it + 1 on 7,600 / 7,600 rounds (ROAD-04) |
| difficulty | `easy` 1 trap / 24 lanes, `medium` 3 / 22, `hard` 5 / 20, `daredevil` 10 / 15 | PAGE: E01 `difficulties`; CODE `src/spec.ts` `DIFFICULTIES` |
| `stake` | decimal on the wallet's 1e-8 grid | PAGE: E01 `rules[6]`; E03 limits |
| lanes walked | lanes 1, 2, … in order, one step at a time, or a number named up front in an auto bet | PAGE: E01 `rules[3]`, `rules[4]` |

The board is **25 slots**, numbered 0 … 24 (PAGE: E01 `slots`). Lane L (1-based) is slot L − 1; slots at or past the
lanes count lie behind the castle gate and are never walked (PAGE: E01 `derivation`).

### 1.2 Commitment

```
commitment = lowercase_hex( SHA-256( UTF-8(serverSeed) ) )
```

- SOURCE: CODE `sha256Hex` (`src/rng.ts`); `src/spec.ts` `COMMITMENT_ENCODING`.
- DATA: 160 / 160 revealed seeds hash to the commitment shown before their rounds (ROAD-01). Each pair also shows the hash
  of the next seed, and every chain of the 13 Oct phases links (ROAD-02). Every server answer of a round carries the same
  hash, client seed and version as the settled block the recompute uses (ROAD-03).

---

## 2. Trap field derivation

### Step 1: HMAC blocks

```
block(b) = HMAC-SHA256( key = UTF-8(serverSeed), message = UTF-8(clientSeed + ":" + dec(nonce) + ":" + dec(b)) )
stream   = block(0) ‖ block(1) ‖ …
```

- SOURCE: PAGE E01 `derivation`; CODE `hmacBlock` (`src/rng.ts`).

### Step 2: 32-bit draws

```
u(i) = bytes 4i .. 4i+3 of stream, read as an unsigned 32-bit BIG-ENDIAN integer       (i = 0, 1, …)
```

One block holds 8 draws; daredevil's 10 traps use blocks 0 and 1.

- SOURCE: PAGE E01 `derivation`; CODE `drawStream` (`src/rng.ts`).

### Step 3: pick from the slots left

```
left = [0, 1, …, 24]                          # kept in ascending order
for i in 0 … m − 1:
    pos  = floor( u(i) × (25 − i) / 2^32 )     # 0 ≤ pos < 25 − i
    trap[i] = left[pos];  remove left[pos]
field = trap[0 .. m − 1]                       # IN THIS ORDER: the order the server's `field` lists them
```

- SOURCE: PAGE E01 `derivation` ("the slot at position floor(u × (25 − i) / 2^32) among the slots not yet picked, kept in
  ascending order … A round of difficulty m is the first m picks"); CODE `positionFromU`, `picks` (`src/rng.ts`).
- The picks for one seed, client seed and nonce are the same sequence on every difficulty; a difficulty takes the first m
  of them (E01's four examples on nonce 1 of the same pair show it: easy `15`, medium `15 6 5`, hard `15 6 5 11 14`).
- DATA: the derived field equals the served `field` **in draw order** on every replayed round of the 13 Oct phases and the
  12 Oct file (ROAD-07). E01's six worked examples recompute (ROAD-09).

### Step 4: the deadly lane

```
trapLane = min{ t + 1 : t ∈ field, t < lanes }      # the first deadly lane, or none
```

- SOURCE: PAGE E01 `derivation` ("Lane L (1-based) is deadly iff slot L − 1 is a trap"); CODE `firstDeadlyLane`
  (`src/rng.ts`).
- DATA: the server's `trapLane` equals the first deadly lane derived on 7,666 / 7,666 replayed rounds (ROAD-07).

### Bias of the map

There is no modulo step and no rejection. For every range n = 16 … 25 that the four difficulties use, every position gets
⌊2^32/n⌋ or ⌈2^32/n⌉ of the 2^32 values of `u`; the worst deviation from 1/n is 2.1913 × 10^-10 (n = 17), below the
profile's 2^-32 ceiling (ROAD-08, a count from the two ends of each position's interval of `positionFromU`, not an enumeration).

---

## 3. Win condition and payout

### 3.1 Win condition

```
the player walks lanes 1, 2, …, k
loss ⇔ trapLane ≤ k: the round ends on the first deadly lane walked and pays 0
win  ⇔ k ≥ 1 safe lanes and a cash-out; crossing the last lane reaches the castle and cashes out by itself
```

- SOURCE: PAGE E01 `rules[2]` to `rules[4]`.
- DATA: a trap ends on exactly the first deadly lane walked, a win crosses none, the castle is the last lane, decided from
  the recomputed field and never the outcome label: 7,666 / 7,666 rounds (ROAD-10).

### 3.2 Multiplier

```
multiplier(m, k) = 99/100 × C(25, k) / C(25 − m, k)
```

computed as the exact fraction `[99 · C(25, k), 100 · C(25 − m, k)]`.

- SOURCE: PAGE E01 `multiplier`, E01 `payouts` (the published table of all 81 (difficulty, lanes) values), E02
  `rulesRoadReturn` ("0.99 × C(25, k) / C(25 − m, k)"); CODE `MULT_NUM`, `MULT_DEN`, `multFrac` (`src/rules.ts`).
- The served `multiplier` field is that fraction's nearest binary64 (CODE `fracToDouble`, `multDouble`). DATA: every
  winning settle 5,932 / 5,932 and every open lane of a stepped round 2,194 / 2,194 (ROAD-13); all 81 published table
  values (ROAD-09).
- Before every lane the game offers the next lane's multiplier and value (`next`); both equal the formula at the next lane
  on 2,844 / 2,844 answers (ROAD-17).

### 3.3 Payout

```
win : payout = floor( stake × 99 · C(25, k) / (100 · C(25 − m, k)) , 8 decimals )     # rounded down once, exact integers
loss: payout = 0
```

- SOURCE: PAGE E01 `rules[6]`; CODE `pay8` (`src/rules.ts`), on integer 1e-8 units (`units8`).
- DATA: exact on 7,665 / 7,665 rounds that settled by a decision (ROAD-11, ROAD-12); every amount the server sent is on
  the 1e-8 grid, 7,666 / 7,666 rounds (ROAD-11).

### 3.4 Win probability and return

```
P(k lanes all safe) = C(25 − m, k) / C(25, k) = Π_{i=0}^{k−1} (25 − m − i) / (25 − i)
RTP(m, k)           = P × multiplier = 99/100        (before the 1e-8 floor)
```

- P is the count with every trap layout equally likely. The map of §2 is within 2^-32 of equal at each pick, not exactly
  equal (ROAD-08); that difference is not carried into P or into the RTP.
- SOURCE: PAGE E01 `return`; CODE `survivalComb`, `survivalProduct` (`src/rules.ts`).
- DATA: the two forms agree in exact integers on all 81 cells (ROAD-18); the derived RTP is 99/100 in every cell (ROAD-19,
  `outputs/rtp-claim-table.json`). The 1e-8 floor costs a 0.02 stake at most 4.20 × 10^-7 of RTP (easy, 2 lanes; see
  [MANIFEST.md](../MANIFEST.md#payouts-and-rtp)).

### 3.5 Max win

```
lane k is allowed  ⇔  maxWin ≤ 0  or  payout(k) − stake ≤ maxWin
```

- SOURCE: PAGE E01 `rules[5]`; CODE `allowed` (`src/rules.ts`); `maxWin` 1000310.0961298 USDT, E03 wallet (`src/spec.ts`
  `MAX_WIN`, held equal to E03 by ROAD-26).
- DATA: every settled win is within it, 7,666 / 7,666; no captured round came near the cap, so the stop branch is
  unwitnessed (ROAD-14 passes with it declared; DL-10).

### 3.6 Idle rounds

A round left without a decision for 24 hours is finished by the server: with lanes crossed it is cashed out at its value;
with none, one lane is walked and, if it is safe, the round is cashed out (PAGE: E01 `rules[7]`; E02 `rulesRoadIdle`). DATA: one round, the
"lanes crossed" branch, was finished on that rule 25 h 9 m 22 s after its last decision (ROAD-31, the other branch
declared unwitnessed; DL-7).

### 3.7 Fields an implementation must not read

`field`, `trapLane`, `hit`, `position`, `outcome`, `multiplier`, `value`, `next`, `payout` are the operator's claims, to be
checked. The derivation reads only `serverSeed`, `clientSeed`, `nonce`, the difficulty, the stake and the lanes walked.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Inputs: server seed, client seed, nonce, difficulty | PAGE | E01 `derivation`, `difficulties` |
| Nonce starts at 1, +1 per round | DATA | 7,600 / 7,600 (ROAD-04) |
| Commitment SHA-256 of the seed's UTF-8 text, hex | CODE + DATA | 160 / 160 (ROAD-01) |
| Next-hash chain | DATA | every 13 Oct chain links (ROAD-02) |
| HMAC-SHA256, key = seed text, message `clientSeed:nonce:b`; u = 4 bytes big-endian | PAGE + CODE | E01 `derivation` |
| pick `floor(u × (25 − i) / 2^32)` among the slots left, ascending | PAGE + CODE + DATA | field in draw order on every round (ROAD-07); E01 examples (ROAD-09) |
| Lane L deadly ⇔ slot L − 1 is a trap | PAGE + CODE + DATA | `trapLane` 7,666 / 7,666 (ROAD-07) |
| No rejection; bias ≤ 2^-32 | CODE + DATA | full census, worst 2.1913 × 10^-10 (ROAD-08) |
| Win ⇔ no deadly lane walked | PAGE + DATA | 7,666 / 7,666 (ROAD-10) |
| multiplier = 99/100 × C(25, k) / C(25 − m, k), served as nearest binary64 | PAGE + CODE + DATA | 5,932 / 5,932 settles, 2,194 / 2,194 lanes (ROAD-13); table 81 / 81 |
| payout = floor8(stake × multiplier), exact | PAGE + CODE + DATA | 7,665 / 7,665 (ROAD-11) |
| RTP 99/100 in every cell | PAGE + CODE | 81 cells (ROAD-18, ROAD-19) |
| Max win stop | PAGE + CODE | declared, not reached (ROAD-14, DL-10) |
| 24-hour rule | PAGE + DATA | one round, "lanes crossed" branch (ROAD-31, DL-7) |

---

## 5. Test vectors

Computed on 21 Oct 2026 with this package's own `src/rng.ts`, `src/rules.ts` and `src/spec.ts` (§7). "block 0" is
`block(0)`, "u(0)" its first four bytes, "pos(0)" the first pick's position among the 25 slots.

**V1: E01's published examples** (PAGE, E01 `examples`; derived field and deadly lane equal the published ones on all six)
```
serverSeed 5a1f7d2c9e4b8a3f6d0c2b5e8f1a4d7c0b3e6f9a2d5c8b1e4f7a0d3c6b9e2f5a  clientSeed housebets  nonce 1
    easy       field 15                            trapLane 16
    medium     field 15 6 5                        trapLane 6
    hard       field 15 6 5 11 14                  trapLane 6
    daredevil  field 15 6 5 11 14 18 13 23 17 24   trapLane 6
serverSeed housebets-demo-server-seed-0001  clientSeed demo-client
    nonce 1  medium     field 17 4 9                           trapLane 5
    nonce 2  daredevil  field 20 21 23 22 8 14 7 1 19 11       trapLane 2
```

**V2: one lane on each difficulty** (stake 1; the first entry of each row of E01 `payouts`)
```
easy       2475/2400 = 33/32   1.03125   payout 1.03125
medium     2475/2200 = 9/8     1.125     payout 1.125
hard       2475/2000 = 99/80   1.2375    payout 1.2375
daredevil  2475/1500 = 33/20   1.65      payout 1.65
```
All 81 fractions of E01 `payouts` equal `multFrac(25, m, k)` (81 / 81).

**V3: round `50550bba-451b-4a74-a509-a61d70d3e02a`** (Phase A, first round, daredevil, auto bet of one lane, win)
```
serverSeed  d47204ce3b9a3db3d6cf9261870235050ca4c3a2b8cc18d3df9d69ae9b7b7f3a
commitment  b947a5d9e715ce68c4e357bef51e829dafc092adee65529846073b0de3da15a7   (= the hash shown before the round)
clientSeed  pfroadstartef10f9de62e53357f791a5bf3b0fcca1   nonce 1   daredevil (m 10, 15 lanes)   stake 0.02
block 0     a43e84bde26ecdb5d599b39f152bdf3a33d3f7fb8f1429ea504fd5da3b715dce   u(0) 2755560637 → pos(0) 16
field       16 22 20 1 5 13 7 6 18 21   (= served, same order)   trapLane 2 (served 2)
lane 1 safe → win, k 1   multiplier 2475/1500 = 1.65 (served 1.65)   payout 0.033 (served 0.033)
```

**V4: round `fd29e16d-93c0-4d8d-9827-a71fa4799634`** (Phase A, hard, auto bet of one lane, loss)
```
serverSeed  d47204ce3b9a3db3d6cf9261870235050ca4c3a2b8cc18d3df9d69ae9b7b7f3a   (same pair as V3)
clientSeed  pfroadstartef10f9de62e53357f791a5bf3b0fcca1   nonce 20   hard (m 5, 20 lanes)   stake 0.02
block 0     05fc96d077b4e0724cc704ecc7564ea9fa64eb705b257dd5bcc43ba51061dd30   u(0) 100439760 → pos(0) 0
field       0 12 7 20 24   (= served)   trapLane 1 (served 1)
lane 1 is deadly → loss (served outcome "trap")   payout 0 (served 0)
```

**V5: round `7097ff40-7b14-460e-bbc0-cf4dd5bc6fe2`** (Phase E, lane by lane, easy, cash-out after 6 lanes)
```
serverSeed  101faedd3d73ef3868bb904e88abc0d75630780badd401a416eeb422ea6f6294
commitment  e130f32feb92713f45fa0fcb26b6032e9a7e543e03219bb2d2cb44e03e5124bb
clientSeed  pfroadstart21f94517417e7ff4055c396adfb07e80   nonce 7   easy (m 1, 24 lanes)   stake 0.02
block 0     b0113b38d3770c00ff1f2deab3f2b06f062f0e622d6f763926164e1bfb5be08c   u(0) 2953919288 → pos(0) 17
field       17   (= served)   trapLane 18 (served 18)
lanes 1–6 safe → cash out, k 6   multiplier 17532900/13459600 = 1.3026315789473684 (served 1.3026315789473684)
payout      0.02605263 (served 0.02605263)
```

**V6: round `245ca494-b25e-4612-ac70-b96ca036d987`** (Phase E, lane by lane, medium, cash-out after 7 lanes)
```
serverSeed  101faedd3d73ef3868bb904e88abc0d75630780badd401a416eeb422ea6f6294   (same pair as V5)
clientSeed  pfroadstart21f94517417e7ff4055c396adfb07e80   nonce 9   medium (m 3, 22 lanes)   stake 0.02
block 0     7b963fd2fb59d2319fd5a7517c465ee750e64b8dec2e330f2c9ecfbcc686ad07   u(0) 2073444306 → pos(0) 12
field       12 24 15   (= served)   trapLane 13 (served 13)
lanes 1–7 safe → cash out, k 7   multiplier 47589300/17054400 = 2.7904411764705883 (served 2.7904411764705883)
payout      0.05580882 (served 0.05580882)
```

---

## 6. Open points

- **O1: the rendered fairness window.** The reveal path (the rotation answer carries the previous server seed) was observed
  in the API and the game's code, not on the rendered fairness window (DL-4).
- **O2: max win.** The cap is declared (E01 `rules[5]`, E03) but no captured round came near it (ROAD-14, declared; DL-10).
- **O3: idle rounds.** The 24-hour rule was observed once, on the "lanes crossed" branch; the "with none" branch (one lane
  walked) was not exercised (ROAD-31, declared; DL-7).
- **O4: free rounds.** The free round (stake 0, E02 `rulesRoadFreeRound`) was not played (DL-8).
- **O5: client-seed encoding beyond ASCII.** UTF-8 is what the code uses; every captured client seed is ASCII.

---

## 7. Reproduction of the vectors

From the package directory, Node 22.6 or later: the vectors in §5 are the output of `picks`, `firstDeadlyLane`, `hmacBlock`,
`sha256Hex`, `positionFromU` (`src/rng.ts`) and `multFrac`, `pay8`, `multDouble` (`src/rules.ts`) on the inputs shown, with
the served values read from the round's settled answer in `data/`. `npm test` recomputes every captured round the same way
(ROAD-07, ROAD-11, ROAD-13); `node verify.js` is the same suite as one file.

## 8. Sources

E01, E02, E03 and E08 in `evidence/`; this package's `src/rng.ts`, `src/rules.ts`, `src/spec.ts`; the scored record
`outputs/verification-results.json`; the datasets in `data/` (V3–V6). HouseBets' own game code was not used to write
this document.
