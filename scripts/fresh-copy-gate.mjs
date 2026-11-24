// The pass rule of the fresh-copy gate (scripts/fresh-copy-check.mjs), kept apart from the run so that it can be tested
// without running the package (tests/fresh-copy-gate.test.mjs, run by `npm run gate:fresh` before the gate itself).
// A run passes only when BOTH verifiers ran in the fresh copy and ended as expected: the source run and the standalone
// verify.js each exited with the exit code of the expected verdict, each printed that verdict, and each printed that it
// reproduced the committed record; the RNG tests passed, the simulation regenerated within tolerance, and no pinned
// file changed. A missing verify.js, a missing verdict line or an unconfirmed reproduction is a failure, never a pass.
// Only a passing run may replace the committed record outputs/fresh-copy.json; a failed run is kept in outputs/run/.
const EXIT_OF = { 'PROVABLY FAIR — Full Pass': 0, 'PROVABLY FAIR — Conditional Pass': 2 };

/** The exit code a verdict of record ends with, or null when a package with that verdict cannot pass the gate. */
export const exitOfVerdict = (v) => (Object.hasOwn(EXIT_OF, v ?? '') ? EXIT_OF[v] : null);

/**
 * @param r        what the fresh copy showed: rngTestsExit, exit, verdict, reproduced (the source run), standaloneExit,
 *                 standaloneVerdict, standaloneReproduced (verify.js; null when verify.js was missing), simulateExit,
 *                 beyondTolerance, pinnedUnchanged
 * @param expected the committed record's verdict
 * @returns the reasons the gate fails; an empty list is a pass
 */
export function gateFailures(r, expectedVerdict) {
  const f = []; const want = exitOfVerdict(expectedVerdict);
  if (want === null) return [`the committed record's verdict is ${JSON.stringify(expectedVerdict)}: not a verdict this gate can pass`];
  if (r.rngTestsExit !== 0) f.push(`the RNG tests ended with exit ${r.rngTestsExit}`);
  if (r.exit !== want) f.push(`the source run ended with exit ${r.exit}, expected ${want}`);
  if (r.verdict !== expectedVerdict) f.push(`the source run printed the verdict ${JSON.stringify(r.verdict)}, expected ${JSON.stringify(expectedVerdict)}`);
  if (r.reproduced !== true) f.push('the source run did not print that it reproduced the committed record');
  if (r.standaloneExit === null || r.standaloneExit === undefined) f.push('verify.js is missing from the copy, or did not run');
  else if (r.standaloneExit !== want) f.push(`verify.js ended with exit ${r.standaloneExit}, expected ${want}`);
  if (r.standaloneVerdict !== expectedVerdict) f.push(`verify.js printed the verdict ${JSON.stringify(r.standaloneVerdict)}, expected ${JSON.stringify(expectedVerdict)}`);
  if (r.standaloneReproduced !== true) f.push('verify.js did not print that it reproduced the committed record');
  if (r.simulateExit !== 0) f.push(`the simulation ended with exit ${r.simulateExit}`);
  if (r.beyondTolerance !== 0) f.push(`${r.beyondTolerance} field(s) of the regenerated simulation differ from the committed one`);
  if (r.pinnedUnchanged !== true) f.push('a pinned file changed during the run');
  return f;
}
