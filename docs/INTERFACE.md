# Module interface the audit package uses (written by the auditor, not from the casino)

`src/rng.ts` and `src/rules.ts` (TypeScript, strict, Node `crypto` only, no dependencies) export exactly these names; the
round replay (`src/replay.ts`) and `tests/verify.ts` take the game's algorithm from them. The simulation (`src/simulate.ts`)
carries faster forms of the same draw built on `positionFromU` (inside `pass1`, and `laneOneDeadly`), which stop as soon as
the answer is known.
Semantics come from [ALGORITHM.md](ALGORITHM.md); this file only fixes names, types and the package's own conventions.
Slots are numbered 0..24 as HouseBets numbers them (E01 `slots`); lanes are 1-based and lane L is slot L − 1. Amounts are
bigint 1e-8 units. The board size `N` passed to `src/rules.ts` is always 25 for this game.

```ts
// src/rng.ts
export const SLOTS: number;    // 25
// One HMAC-SHA256 block: key = serverSeed as UTF-8, message = `${clientSeed}:${nonce}:${block}`.
export function hmacBlock(serverSeed: string, clientSeed: string, nonce: number, block: number): Buffer;
// The map from a 32-bit draw u to a position among n remaining slots: floor(u · n / 2^32). ROAD-08 censuses it.
export const positionFromU: (u: number, n: number) => number;
// The round's 32-bit big-endian draws, block after block (8 per block).
export function drawStream(serverSeed: string, clientSeed: string, nonce: number): Generator<number>;
// The first m picks on the 25 slots, IN DRAW ORDER (= the order the server's `field` lists them).
export function picks(serverSeed: string, clientSeed: string, nonce: number, m: number): number[];
// The first deadly lane of a field on a road of `lanes` lanes (lane L deadly iff slot L − 1 is a trap), or null.
export function firstDeadlyLane(field: readonly number[], lanes: number): number | null;
// The commitment: SHA-256 of the seed's UTF-8 text, lowercase hex.
export const sha256Hex: (s: string) => string;

// src/rules.ts
export const comb: (n: number, k: number) => bigint;                                // C(n, k), 0 outside 0..n
export const MULT_NUM: bigint, MULT_DEN: bigint;                                     // 99n, 100n
export const multFrac: (N: number, m: number, k: number) => [bigint, bigint];       // [99·C(N,k), 100·C(N−m,k)]
export const pay8: (stake8: bigint, N: number, m: number, k: number) => bigint;    // floor(stake × multiplier), 1e-8 units
export function fracToDouble(num: bigint, den: bigint): number;                    // nearest binary64, half to even
export const multDouble: (N: number, m: number, k: number) => number;              // the served `multiplier`
export function units8(x: number | string): bigint;                                 // a JSON decimal to 1e-8 units
export const allowed: (stake8: bigint, cap8: bigint | null, N: number, m: number, k: number) => boolean;   // max-win rule
export const survivalComb: (N: number, m: number, k: number) => [bigint, bigint];   // [C(N−m,k), C(N,k)]
export function survivalProduct(N: number, m: number, k: number): [bigint, bigint]; // Π(N−m−i) / Π(N−i)
```
The difficulties (`easy` 1 trap / 24 lanes, `medium` 3 / 22, `hard` 5 / 20, `daredevil` 10 / 15) are `DIFFICULTIES` in
`src/spec.ts`. The verdict never reads an operator field to decide an outcome: `field`, `trapLane`, `outcome`,
`multiplier` and `payout` are compared with these functions' results, never used as inputs.
