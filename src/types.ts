// Shapes of the HouseBets new-engine Hubie's Road capture (multi-step rig, schema of capture-hb-road.mjs, 13 Oct 2026).
// Only the fields the verifier reads are typed; the dataset carries more (every request and the server's raw answer).

export interface Fairness { version?: string; hashedServerSeed?: string; clientSeed?: string; nonce?: number }
export interface Game {
  id?: number; roundId?: string; active?: boolean; difficulty?: string; traps?: number; lanes?: number; stake?: number | string;
  maxWin?: number | string; position?: number; hit?: number | null; field?: number[] | null; trapLane?: number | null;
  multiplier?: number; value?: number | string; outcome?: string | null; payout?: number | string;
  options?: { step?: boolean; cashout?: boolean; maxWin?: boolean }; fairness?: Fairness; createdAt?: string; settledAt?: string;
}
export interface Answer { game?: Game; round?: { roundId?: string; stake?: number | string; payout?: number | string }; balance?: number }
export interface Request { at?: string; method?: string; path: string; body: any; status?: number; response?: Answer | any; negativeTest?: string }
export interface Round {
  idx: number; planIdx: number; phase?: string; spec: { kind?: string; difficulty?: string; steps?: number; stopLane?: number };
  pre?: { seedId?: number; clientSeed?: string; hashedServerSeed?: string; hashedNextServerSeed?: string; nonceBefore?: number };
  requests: Request[]; detail?: { path?: string; status?: number; response?: Answer } | null; roundId?: string; outcome?: string;
  closedByServer?: boolean; closedByAuditor?: boolean; replays?: unknown[]; skipped?: unknown; maxWinStop?: boolean;
}
export interface Seed {
  seedId: number; epoch: number; clientSeed: string; clientSeedSource?: string; hashedServerSeed: string; hashedNextServerSeed: string;
  revealedServerSeed: string; nonceStart?: number; serverNonceAtRotation: number; rounds?: number;
  clientSeedDrawnAfterCommitment?: { committedHash?: string; commitmentReadAt?: string; clientSeedDrawnAt?: string };
}
export interface Dataset {
  meta: any;
  preCapture?: { hashedServerSeed?: string; hashedNextServerSeed?: string; revealedServerSeed?: string; clientSeed?: string; seedId?: number };
  seeds: Seed[];
  rounds: Round[];
}
