// Every figure a check compares against that HouseBets publishes is read at verify time from the
// pinned exhibit that carries it, never from a hand copy. ROAD-26 checks the exhibit's sha256 first; only then is it read.
// Where a constant stays in src/ (src/spec.ts SLOTS, DIFFICULTIES, SPEC_EXAMPLES, SPEC_PAYOUTS, MIN_STAKE, MAX_WIN;
// src/rules.ts MULT_NUM / MULT_DEN), ROAD-26 asserts it equals the exhibit's value and a mismatch is a reproduction failure
// (FAIL, exit 1). The published RTP figure has no hand copy at all: the RTP-CLAIM claim (src/rtp-settings.ts) is built from
// the places below, so a change to the published figure reaches the -19 check and its verdict (RTP FIGURE OVERSTATED, exit
// 5) without any code edit.
import { readJson } from './loader.ts';

export const E01_FILE = 'evidence/E01-road-fairness-spec-2026-10-13.json';
export const E02_FILE = 'evidence/E02-road-rules-panel-2026-10-10.json';
export const E03_FILE = 'evidence/E03-road-limits-2026-10-13.json';
/** The same rules panel in the live copy of the bundle (fetched 19 Oct 2026, last-modified 16 Oct 2026): rulesRoadReturn was
 *  reworded on 16 Oct and still states the house edge, "(1% house edge)", so it is a place of its own. */
export const E08_FILE = 'evidence/E08-road-rules-panel-live-2026-10-19.json';

/** A percentage as written in an exhibit ("99", "99.5") → the exact decimal fraction of 1 ("0.99", "0.995"). */
export function pctToFraction(p: string): string {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(p); if (!m) throw new Error(`not a percentage: ${p}`);
  const f = m[2] ?? '', digits = (m[1] + f).replace(/^0+(?=\d)/, ''), scale = f.length + 2;
  const padded = digits.padStart(scale + 1, '0');
  return (padded.slice(0, -scale) + '.' + padded.slice(-scale)).replace(/0+$/, '').replace(/\.$/, '');
}
/** 1 − (an edge percentage) as an exact decimal fraction of 1: "1" → "0.99". */
export function oneMinusPct(p: string): string {
  const e = pctToFraction(p); const [i, f = ''] = e.split('.'); const scale = Math.max(f.length, 1);
  const units = 10n ** BigInt(scale) - BigInt(i + f.padEnd(scale, '0'));
  if (units < 0n) throw new Error(`edge above 100 %: ${p}`);
  const s = units.toString().padStart(scale + 1, '0');
  return `${s.slice(0, -scale)}.${s.slice(-scale)}`.replace(/0+$/, '').replace(/\.$/, '');
}

/** One place in the evidence where HouseBets states the road return, with the figure it states (exact fraction of 1). */
export interface RtpPlace { place: 'game settings' | 'rules'; where: string; text: string; rtp: string }

/** Every place in the shipped evidence that states the road return as a figure: E01 "return" (the game settings
 *  the site loads), E02 rulesRoadReturn "(N% house edge)" (the rules) and E08 rulesRoadReturn, its 16 Oct rewording in the
 *  live copy (the rules). The same E02 string's "{pct}%" is a template the
 *  page fills at run time and states no figure. Throws when a place has lost its figure (ROAD-26 reports it as a FAIL). */
export function rtpPlaces(): RtpPlace[] {
  const e1 = readJson(E01_FILE).answer, e2 = readJson(E02_FILE).rulesPanelEnglish;
  const ret = String(e1.return ?? ''); const m1 = /^(\d+(?:\.\d+)?)%/.exec(ret);
  if (!m1) throw new Error(`E01 "return" states no percentage: ${JSON.stringify(ret)}`);
  const rr = String(e2.rulesRoadReturn ?? ''); const m2 = /\((\d+(?:\.\d+)?)% house edge\)/.exec(rr);
  if (!m2) throw new Error(`E02 rulesRoadReturn states no house edge: ${JSON.stringify(rr)}`);
  const lr = String(readJson(E08_FILE).rulesPanelEnglish?.rulesRoadReturn ?? ''); const m3 = /\((\d+(?:\.\d+)?)% house edge\)/.exec(lr);
  if (!m3) throw new Error(`E08 rulesRoadReturn states no house edge: ${JSON.stringify(lr)}`);
  return [
    { place: 'game settings', where: 'E01 "return" (GET /housegames/road/fairness)', text: ret, rtp: pctToFraction(m1[1]) },
    { place: 'rules', where: 'E02 rulesRoadReturn (game page rules panel)', text: rr, rtp: oneMinusPct(m2[1]) },
    { place: 'rules', where: 'E08 rulesRoadReturn (game page rules panel, live copy of 19 Oct)', text: lr, rtp: oneMinusPct(m3[1]) },
  ];
}

/** Compare two exact decimal fractions of 1 ("0.99" vs "0.995"): −1, 0, 1. */
export function cmpDec(a: string, b: string): number {
  const [ai, af = ''] = a.split('.'), [bi, bf = ''] = b.split('.'); const n = Math.max(af.length, bf.length);
  const x = BigInt(ai + af.padEnd(n, '0')), y = BigInt(bi + bf.padEnd(n, '0')); return x < y ? -1 : x > y ? 1 : 0;
}

/** The figure the claim is held to: the HIGHEST figure any place states (a player reading that place is told at least that
 *  much); `agree` says whether every place states the same figure. Player-favourable understatement never fails (RTP-CLAIM). */
export function publishedRtp(): { rtp: string; agree: boolean; places: RtpPlace[] } {
  const places = rtpPlaces(); const rtp = places.map((p) => p.rtp).reduce((a, b) => (cmpDec(a, b) >= 0 ? a : b));
  return { rtp, agree: places.every((p) => cmpDec(p.rtp, rtp) === 0), places };
}

/** The multiplier formula's coefficient as published: E01 "multiplier" "× 99/100 ×" and E02 rulesRoadReturn "0.99 ×". */
export function publishedCoefficient(): { e01: string | null; e02: string | null } {
  const e1 = String(readJson(E01_FILE).answer.multiplier ?? ''), e2 = String(readJson(E02_FILE).rulesPanelEnglish.rulesRoadReturn ?? '');
  const a = /× (\d+)\/(\d+) × C\(25, k\)/.exec(e1), b = /multiplier is (\d+(?:\.\d+)?) × C\(25, k\)/.exec(e2);
  return { e01: a ? `${a[1]}/${a[2]}` : null, e02: b ? b[1] : null };
}

/** E01's tables as published: slots, difficulties, worked examples and the per-lane multiplier table. */
export function e01Tables(): { slots: number; difficulties: { name: string; traps: number; lanes: number }[]; examples: any[]; payouts: Record<string, string[]> } {
  const a = readJson(E01_FILE).answer; return { slots: a.slots, difficulties: a.difficulties, examples: a.examples, payouts: a.payouts };
}

/** E03 wallet limits (the audited wallet, USDT), as the exhibit carries them. */
export function walletLimits(): { minBet: string; maxBet: string; maxWin: string } {
  const w = readJson(E03_FILE).answer.wallet; return { minBet: String(w.minBet), maxBet: String(w.maxBet), maxWin: String(w.maxWin) };
}
