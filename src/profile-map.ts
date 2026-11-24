// The ROAD profile's 31 checks (id, name, layer, kind, policy), generated from the framework's public profile games/road/profile.public.json
// (profileVersion 1.0.2-public, framework 1.1, sha256 e4c4bfef098b232b0ecb2bc92e6dc67365ab058aaf7b10b30dc9eb96f65d86a0) by tools/gen-profile-map.mjs. Regenerate rather than edit.
// The framework file itself ships as profile/profile.json; tests/verify.ts checks its sha256 against
// PROFILE_SHA256 and these rows against it at run time, and takes the scored list and the policies from it.
export type Policy = 'HARD_FAIL' | 'FLAG' | 'INFORMATIONAL' | 'GRADED' | 'RELEASE_GATE';
export interface ProfileCheck { id: string; name: string; layer: string; kind: 'verifier-step' | 'package-check'; policy: Policy }
export const PROFILE_SHA256 = 'e4c4bfef098b232b0ecb2bc92e6dc67365ab058aaf7b10b30dc9eb96f65d86a0';
export const PROFILE_VERSION = "1.0.2-public";
export const PROFILE: readonly ProfileCheck[] = [
  { id: "ROAD-01", name: "Seed hash integrity", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-02", name: "Forward commitment chain", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-03", name: "Hash consistency within epoch", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-04", name: "Nonce continuity", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-05", name: "Population & epoch size (G-BIND)", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-06", name: "Client-seed influence & Phase D recomputation", layer: "S1", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-07", name: "Trap-field recomputation", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-08", name: "Draw bias bound", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-09", name: "RNG reference vectors", layer: "S2", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-10", name: "Lane outcome & step-sequence consistency", layer: "S2", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-11", name: "Payout arithmetic", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-12", name: "Bet-size invariance (Phase C)", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-13", name: "Multiplier formula & provenance", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-14", name: "Multiplier monotonicity & bounds", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "ROAD-15", name: "Difficulty & depth coverage", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "ROAD-16", name: "Wallet / balance reconciliation", layer: "S3", kind: "verifier-step", policy: "FLAG" },
  { id: "ROAD-17", name: "Multi-step parity", layer: "S3", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-18", name: "Anti-circularity (win probability)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-19", name: "Effective RTP per cell vs claim", layer: "S4", kind: "verifier-step", policy: "FLAG" },
  { id: "ROAD-20", name: "Simulation Pass 1 (fresh seeds)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-21", name: "Simulation Pass 2 (cherry-pick)", layer: "S4", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-22", name: "Live-sample fit", layer: "S4", kind: "verifier-step", policy: "INFORMATIONAL" },
  { id: "ROAD-23", name: "S5 fairness-integrity matrix", layer: "S5", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-24", name: "Player-verifier parity", layer: "S6", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-25", name: "Player check path documented", layer: "S6", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-26", name: "Dataset & config pins", layer: "S7", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-27", name: "Artifacts of record", layer: "S7", kind: "verifier-step", policy: "HARD_FAIL" },
  { id: "ROAD-28", name: "Fresh-clone reproduction", layer: "S7", kind: "package-check", policy: "RELEASE_GATE" },
  { id: "ROAD-29", name: "Mutation battery", layer: "S7", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-30", name: "Disclosure register & evidence appendix", layer: "S7", kind: "package-check", policy: "GRADED" },
  { id: "ROAD-31", name: "Abandoned-round rule (24 h)", layer: "S3", kind: "verifier-step", policy: "FLAG" },
];
