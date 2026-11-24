// RTP-CLAIM wiring — HouseBets Hubie's Road: the per-setting exact RTP table and the claim it is held to.
// The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (conformance C-13 compares the
// SHA-256), version 1.2.0. The switch src/rtp-claim-switch.ts is ON (Methodology v1.1, 14 Oct 2026): the -19 check is
// scored; a house-side miss is OVERSTATED and the verdict RTP FIGURE OVERSTATED (exit 5), never NOT PROVABLY FAIR.
//
// SETTINGS. Every way a player can stop: every difficulty (easy, medium, hard, daredevil: 1, 3, 5, 10 traps on 25 slots) and
// every number of lanes crossed k = 1 … lanes (24, 22, 20, 15; E01 "difficulties"): 81 settings.
// EXACT RTP. P(k lanes safe) = C(25 − m, k) / C(25, k) × the multiplier 99·C(25, k) / (100·C(25 − m, k)) (E01 "multiplier";
// ROAD-13: every winning round of the capture) — computed as the product of the two fractions, in exact integers.
// CLAIM. Read at run time from the pinned exhibits, never from a constant: every place the evidence
// states the return as a figure (src/exhibits.ts rtpPlaces), held to the highest of them. The source names each place and
// says how it was read: in the game's code and answers, not on a rendered page. Not scored here: the payout's truncation to
// the wallet's 1e-8 unit (E01 rules), which depends on the stake (MANIFEST.md#payouts-and-rtp states its size).
//   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RtpClaimAccumulator, rtpClaimTable, rtpClaimGate } from './rtp-claim';
import type { RtpClaim, RtpClaimResult, RtpClaimGate } from './rtp-claim';
import { multFrac, survivalComb } from './rules.ts';
import { SLOTS, DIFFICULTIES, DIFFICULTY_NAMES } from './spec.ts';
import { publishedRtp } from './exhibits.ts';
import { ROOT } from './loader.ts';

/** The claim, built from the exhibits (pin-checked by ROAD-26 before verify calls this). */
export function rtpClaim(): RtpClaim {
  const pub = publishedRtp(); const [e01, e02, e08] = pub.places;
  return {
    kind: 'flat',
    rtp: pub.rtp,
    source: `HouseBets Hubie's Road, stated in three places, each read in the game's code or answers, none on a rendered page (DL-11): `
      + `in the game settings the site loads — the fairness answer, ${e01.where}: "${e01.text}", requested by the road game bundle `
      + `(platform-housegames-road-game.js sha256 d9ba3797255b6729…, the file E02 cites: jt("/"+rq+"/fairness") then setFairnessSpec; `
      + `that the live road page loads this bundle is inferred, bundles/LIVE-BUNDLES.md 10 Oct 2026); and in the rules — the game page `
      + `rules panel in that bundle, ${e02.where}: "${e02.text}" (its {pct} is filled at run time, not captured rendered; the figure `
      + `read is the stated house edge); and, since HouseBets reworded rulesRoadReturn on 16 Oct, in the live copy of that bundle, `
      + `${e08.where}: "${e08.text}" (E08). Held to the highest figure stated: ${pub.places.map((p) => `${p.place} ${p.rtp}`).join(', ')}${pub.agree ? ' (they agree)' : ' (THEY DISAGREE)'}.`,
  };
}
export const RTP_CLAIM_TABLE = join(ROOT, 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = '990ac06aed1e2dd9f78511a2e0d34cd4c630e2e99d61979e8730a76ce95518d8';

export function computeRtpClaim(): RtpClaimResult {
  const acc = new RtpClaimAccumulator(rtpClaim());
  for (const d of DIFFICULTY_NAMES) {
    const [m, lanes] = DIFFICULTIES[d];
    for (let k = 1; k <= lanes; k++) {
      const [a, b] = multFrac(SLOTS, m, k), [c, e] = survivalComb(SLOTS, m, k);
      acc.add(`${d} (${m} traps) · ${k} lanes`, a * c, b * e, d);
    }
  }
  return acc.result();
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'housebets/road', game: 'road',
    settingSpace: 'every difficulty (easy 1 trap / 24 lanes, medium 3 / 22, hard 5 / 20, daredevil 10 / 15) and lanes crossed k = 1 … lanes (81 settings)',
    rtpMethod: 'exact rational: C(25−m,k)/C(25,k) × 99·C(25,k)/(100·C(25−m,k)), the settled multiplier',
  });
}

export function runRtpClaimGate(): RtpClaimGate {
  const r = computeRtpClaim();
  return rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
}

if (process.argv[1] && /rtp-settings\.ts$/.test(process.argv[1])) {
  const text = rtpClaimTableText(computeRtpClaim());
  writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
