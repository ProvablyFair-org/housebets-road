// The fresh-copy gate must fail when it has not confirmed the package: `npm run gate:fresh` runs these before the gate.
// The first two cases are two situations in which the gate must not exit 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateFailures, exitOfVerdict } from '../scripts/fresh-copy-gate.mjs';

const FULL = 'PROVABLY FAIR — Full Pass', COND = 'PROVABLY FAIR — Conditional Pass';
const good = (verdict, exit) => ({ rngTestsExit: 0, exit, verdict, reproduced: true, standaloneExit: exit, standaloneVerdict: verdict, standaloneReproduced: true, simulateExit: 0, beyondTolerance: 0, pinnedUnchanged: true });

test('verify.js removed from the copy: the gate fails', () => {
  const f = gateFailures({ ...good(FULL, 0), standaloneExit: null, standaloneVerdict: null, standaloneReproduced: null }, FULL);
  assert.ok(f.length > 0); assert.match(f.join('; '), /verify\.js is missing/);
});
test('exit codes 0 but no verdict line and no confirmed reproduction: the gate fails', () => {
  const f = gateFailures({ ...good(FULL, 0), verdict: null, standaloneVerdict: null, reproduced: false, standaloneReproduced: false }, FULL);
  assert.ok(f.length >= 4); assert.match(f.join('; '), /did not print that it reproduced/);
});
test('every single unconfirmed field fails the gate', () => {
  const bad = { rngTestsExit: 1, exit: 1, verdict: 'NOT PROVABLY FAIR', reproduced: false, standaloneExit: 1, standaloneVerdict: 'NOT PROVABLY FAIR', standaloneReproduced: false, simulateExit: 1, beyondTolerance: 1, pinnedUnchanged: false };
  for (const [k, v] of Object.entries(bad)) assert.ok(gateFailures({ ...good(FULL, 0), [k]: v }, FULL).length > 0, k);
});
test('a confirmed run passes, with the exit code of its verdict', () => {
  assert.deepEqual(gateFailures(good(FULL, 0), FULL), []);
  assert.deepEqual(gateFailures(good(COND, 2), COND), []);
  assert.ok(gateFailures(good(FULL, 0), COND).length > 0);       // the other verdict than the committed record's
  assert.ok(gateFailures(good(COND, 0), COND).length > 0);       // the verdict of record with another exit code
});
test('a failing verdict of record cannot pass the gate', () => {
  assert.equal(exitOfVerdict('NOT PROVABLY FAIR'), null);
  assert.ok(gateFailures({ ...good('NOT PROVABLY FAIR', 1) }, 'NOT PROVABLY FAIR').length > 0);
});
