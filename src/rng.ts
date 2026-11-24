// HouseBets House Games Hubie's Road (API slug `road`, fairness version "canonical"), derived from the published spec only
// (GET /housegames/road/fairness, E01):
//   block_i = HMAC_SHA256(key = serverSeed as UTF-8, message = `${clientSeed}:${nonce}:${i}`)
//   trap i (i = 0, 1, …) = bytes 4i..4i+3 of block_0 ‖ block_1 ‖ … read as a big-endian number u; it is the slot at position
//   floor(u × (25 − i) / 2^32) among the slots not yet picked, kept in ascending order. A difficulty of m traps is the first
//   m picks, IN DRAW ORDER (the order the server's `field` lists them). Lane L (1-based) is deadly iff slot L − 1 is a trap.
// Everything is integer arithmetic: u × n < 2^37 and the division is by a power of two, exact in binary64.
import { createHmac, createHash } from 'node:crypto';

export const SLOTS = 25;

export function hmacBlock(serverSeed: string, clientSeed: string, nonce: number, block: number): Buffer {
  return createHmac('sha256', Buffer.from(serverSeed, 'utf8')).update(`${clientSeed}:${nonce}:${block}`).digest();
}

/** The declared map from the 32-bit draw u to a position among n remaining slots: floor(u · n / 2^32). ROAD-08 censuses
 *  this function for every range n the game uses. */
export const positionFromU = (u: number, n: number): number => Math.floor((u * n) / 4294967296);

/** A stream of the round's 32-bit draws, block after block. */
export function* drawStream(serverSeed: string, clientSeed: string, nonce: number): Generator<number> {
  for (let b = 0; ; b++) { const d = hmacBlock(serverSeed, clientSeed, nonce, b); for (let o = 0; o < 32; o += 4) yield d.readUInt32BE(o); }
}

/** The first m picks on the 25 slots, in draw order: the trap field of a difficulty with m traps. */
export function picks(serverSeed: string, clientSeed: string, nonce: number, m: number): number[] {
  const left: number[] = Array.from({ length: SLOTS }, (_, i) => i); const out: number[] = [];
  const it = drawStream(serverSeed, clientSeed, nonce);
  for (let i = 0; i < m; i++) out.push(left.splice(positionFromU(it.next().value as number, SLOTS - i), 1)[0]);
  return out;
}

/** The first deadly lane of a field on a road of `lanes` lanes (lane L deadly iff slot L − 1 is a trap), or null. */
export function firstDeadlyLane(field: readonly number[], lanes: number): number | null {
  let best: number | null = null; for (const t of field) if (t < lanes && (best === null || t + 1 < best)) best = t + 1; return best;
}

export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
