// Dataset pins and the population of record, stated as CODE next to the pin (a dataset that agrees with its own header
// proves nothing; the scored steps compare against these constants, never meta).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Dataset } from './types.ts';

/** The package root: the nearest folder above this module holding package.json "housebets-road-audit" (works from src/
 *  under Node and from the bundled verify.js at the root). */
function findRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const p = join(d, 'package.json');
    if (existsSync(p) && /"name":\s*"housebets-road-audit"/.test(readFileSync(p, 'utf8'))) return d;
    d = dirname(d);
  }
  throw new Error('package root not found');
}
export const ROOT = findRoot();
export const DATA = join(ROOT, 'data');

// Phase A primary: 6,500 one-lane auto rounds, 130 seed pairs of exactly 50 (13 Oct 2026 15:00–17:30 UTC)
export const PRIMARY_FILE = 'housebets-road-phaseA-auto1-6500rounds.json';
export const PRIMARY_SHA256 = '56e58a1c3316d8f3a79c6558e61aa5c61eea8e81ce6d05a8af4b94b98d885690';
// Supplementary phases (13 Oct 2026), each its own dataset and evidence id
export const PHASE_C_FILE = 'supplementary/housebets-road-phaseC-elevated-150rounds.json';
export const PHASE_C_SHA256 = 'a4f540a25def753cc6813b939bdb2d6176329f8a9a6be96ceddfa5abedac1968';
export const PHASE_C10_FILE = 'supplementary/housebets-road-phaseC-elevated-10usd-150rounds.json';
export const PHASE_C10_SHA256 = '4b64dc99a05a44add4d05b52e6e737b6505f3d42570121c2ebbee90f2449e67a';
export const PHASE_D_FILE = 'supplementary/housebets-road-phaseD-playerseeds-200rounds.json';
export const PHASE_D_SHA256 = 'e2e81e4388d1b0973347c39f7964689082f5c631fbc85eec0a7f53a45ff6b5e6';
export const PHASE_E_FILE = 'supplementary/housebets-road-phaseE-multistep-600rounds.json';
export const PHASE_E_SHA256 = '5a4635d851701ab9c6cbdbc0a0cd513c8c653c2d726a5164eeffb92c730c0f82';
// The 12 Oct 2026 capture file that holds the round left open on purpose and the server's close of it 24 h+ later. Its rounds
// recorded whole are recomputed one by one ; it is never counted as a population (ROAD-05).
export const H24_FILE = 'supplementary/housebets-road-full-67rounds-withopen.json';
export const H24_SHA256 = '02ba95c67529eab6e7f10822d7260f4670d6060c15d7b4f4edb854c99d7e583a';
/** Every dataset of the package with the label the verifier prints for it. Pass 2 (ROAD-21) replays every revealed seed of
 *  every one of them. */
export const ALL_DATASETS: readonly (readonly [string, string])[] = [['A', PRIMARY_FILE], ['C', PHASE_C_FILE], ['C $10', PHASE_C10_FILE],
  ['D', PHASE_D_FILE], ['E', PHASE_E_FILE], ['12 Oct', H24_FILE]];

/** Evidence exhibits the steps read and the ones MANIFEST cites (all pinned, scripts/make-evidence.py). */
export const EVIDENCE_PINS: readonly (readonly [string, string])[] = [
  ['evidence/E01-road-fairness-spec-2026-10-13.json', '7f597e347e82c422c0a8ea308fed6d6a0f3baaed672e8b7ebeec9dafc24e2a70'],
  ['evidence/E02-road-rules-panel-2026-10-10.json', '15fb45f510077fbf7c5f051d9bc6edf3d58fbb168db9bfc16246c103e8621486'],
  ['evidence/E03-road-limits-2026-10-13.json', 'd5e3d9731500e693e3ea97e2bc06160b93737f9bc9625a88e9892a394d35f29c'],
  ['evidence/E04-road-bet-history-2026-10-13.json', 'cd918e55a4f7aad60a8c943f9af464a2360dead71d746b326a2601986e618c6f'],
  ['evidence/E05-account-reconcile-2026-10-13.txt', 'a10834e35226d1b1b03cf50e431b442f4321ee2076a80796aaf6a32898991812'],
  ['evidence/E06-road-empty-seed-control-2026-10-13.json', '22522d49efe2b5577f74035a58330f9b7058bdf1620b3e625e0ff9a2ee48e072'],
  ['evidence/E07-road-abandoned-round-2026-10-13.json', '1b5f20a2d684efcf117a94aac35fb59cbf5d67d5bb99d07062ac62bcdc502a26'],
  ['evidence/E08-road-rules-panel-live-2026-10-19.json', 'd4dd4251ff0db13e23438e82a47e59097448bc8878afdc06ecc2fddcf49600f3'],
];

// The population of record
export const EXPECTED_ROUNDS = 6500;
export const EXPECTED_SEEDS = 130;
export const EXPECTED_EPOCHS = 130;
export const EXPECTED_EPOCH_SIZE = 50;
export const EXPECTED_PHASE_C_ROUNDS = 150;     // 3 epochs × 50, easy, one lane named up front, stake 2.00 (100 × the Phase A stake 0.02)
export const EXPECTED_PHASE_C10_ROUNDS = 150;   // 3 epochs × 50, same config, stake 10 (the $10 set)
export const EXPECTED_PHASE_D_ROUNDS = 200;     // 4 epochs × 50, one player-set client seed per epoch
export const EXPECTED_PHASE_E_ROUNDS = 600;     // 12 epochs × 50, lane-by-lane rounds
export const PHASE_A_STAKE = '0.02';
export const PHASE_C_STAKE = '2';
export const PHASE_C10_STAKE = '10';
export const PHASE_C_DIFFICULTY = 'easy';
export const PHASE_D_SEEDS = ['provablyfair-1', 'provablyfair-2', 'player-seed-abc', '1234567890'] as const;
export const NONCE_BASE = 1;   // HouseBets nonces start at 1 on a fresh pair (every epoch of the capture)
/** Phase A capture plan: the four difficulties, 1,625 one-lane rounds each. */
export const PLAN_ROUNDS_PER_DIFFICULTY = 1625;
export const PLAN_DIFFICULTY_FLOOR = 50;   // ROAD-15: Phase A ≥ 50 rounds per difficulty

export const sha256Bytes = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
export const sha256File = (rel: string): string => sha256Bytes(readFileSync(join(ROOT, rel.startsWith('evidence/') || rel.startsWith('outputs/') ? rel : join('data', rel))));
export const load = (rel: string): Dataset => JSON.parse(readFileSync(join(DATA, rel), 'utf8')) as Dataset;
export const readJson = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
