// ROAD-09 RNG reference vectors: the worked examples of HouseBets' own published road spec (E01, GET /housegames/road/fairness,
// 13 Oct 2026), its 81 published multipliers, and one captured round of the primary dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picks, firstDeadlyLane } from '../src/rng.ts';
import { multFrac, multDouble, pay8, units8 } from '../src/rules.ts';
import { SPEC_EXAMPLES, SPEC_PAYOUTS, DIFFICULTIES, SLOTS } from '../src/spec.ts';

for (const x of SPEC_EXAMPLES) test(`spec example ${x.clientSeed}:${x.nonce} ${x.difficulty}`, () => {
  const [m, lanes] = DIFFICULTIES[x.difficulty]; const f = picks(x.serverSeed, x.clientSeed, x.nonce, m);
  assert.deepEqual(f, [...x.field]); assert.equal(firstDeadlyLane(f, lanes), x.trapLane);
});
for (const [d, list] of Object.entries(SPEC_PAYOUTS)) test(`spec payouts ${d}: ${list.length} lanes`, () => {
  const [m, lanes] = DIFFICULTIES[d]; assert.equal(list.length, lanes);
  list.forEach((s, i) => { const [a, b] = multFrac(SLOTS, m, i + 1); const [n, q] = s.split('/').map(BigInt); assert.equal(a * q, b * n, `${d} lane ${i + 1}`); });
});
// Phase A round idx 0 (epoch 0, nonce 1): daredevil, one lane, cashed out at ×1.65, payout 0.033, trap lane 2
test('Phase A round 0: field, trap lane, served multiplier and payout recompute', () => {
  const f = picks('d47204ce3b9a3db3d6cf9261870235050ca4c3a2b8cc18d3df9d69ae9b7b7f3a', 'pfroadstartef10f9de62e53357f791a5bf3b0fcca1', 1, 10);
  assert.deepEqual(f, [16, 22, 20, 1, 5, 13, 7, 6, 18, 21]);
  assert.equal(firstDeadlyLane(f, 15), 2);
  assert.equal(multDouble(SLOTS, 10, 1), 1.65);
  assert.equal(pay8(units8(0.02), SLOTS, 10, 1), units8(0.033));
});
