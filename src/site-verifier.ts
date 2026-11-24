// The site-verifier module (site-verifier/derive.js) as check 24 reads it: loaded at run time from the file beside the
// package (never bundled into verify.js, exactly as the datasets are read from disk), hashed, and run side by side with
// src/rng.ts. The module is generated from src/rng.ts by scripts/build-site-verifier.mjs; its pin is SITE_VERIFIER_PIN in
// src/artifact-pins.ts. This file holds no game logic: the calls to compare are given by tests/verify.ts.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export interface SiteModule {
  file: string;
  /** sha256 of the file on disk; null when it is missing. */
  sha256: string | null;
  /** The module's exports; null when the file is missing or does not load. */
  mod: Record<string, any> | null;
  /** Why it did not load, when it did not. */
  error: string | null;
}

/** Hashes and loads the module from disk. Never throws: a missing or broken file comes back with mod null and the reason. */
export async function loadSiteModule(root: string, file: string): Promise<SiteModule> {
  const p = join(root, file);
  if (!existsSync(p)) return { file, sha256: null, mod: null, error: `${file} missing` };
  const sha256 = createHash('sha256').update(readFileSync(p)).digest('hex');
  try { return { file, sha256, mod: { ...(await import(pathToFileURL(p).href)) }, error: null }; }
  catch (e) { return { file, sha256, mod: null, error: `${file} does not load: ${String((e as Error)?.message ?? e).split('\n')[0]}` }; }
}

/** Equality of two results: byte arrays (Buffer, Uint8Array) by content, arrays element by element, plain objects key by
 *  key, everything else by ===. A function or an iterator is never equal: the caller reads values out of it first. */
export function sameResult(a: unknown, b: unknown): boolean {
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameResult(x, b[i]));
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort(), kb = Object.keys(b as object).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameResult((a as any)[k], (b as any)[k]));
  }
  if (typeof a === 'function' || typeof b === 'function') return false;
  return a === b;
}

/** One comparison: a label (the function compared) and a call that takes either set of exports and returns a result. */
export type Probe = readonly [label: string, call: (m: Record<string, any>) => unknown];

export interface Replay { calls: number; differences: number; first: string | null; byLabel: Record<string, number> }

/** Runs every probe on the reference exports (src/rng.ts) and on the module's, and counts the calls whose results differ.
 *  A call that throws in the module is a difference; a call that throws in the reference is an error of the check itself. */
export function replay(reference: Record<string, any>, mod: Record<string, any>, probes: Iterable<Probe>): Replay {
  const out: Replay = { calls: 0, differences: 0, first: null, byLabel: {} };
  for (const [label, call] of probes) {
    const want = call(reference);
    let got: unknown, threw: string | null = null;
    try { got = call(mod); } catch (e) { threw = String((e as Error)?.message ?? e).split('\n')[0]; }
    out.calls++; out.byLabel[label] = (out.byLabel[label] ?? 0) + 1;
    if (threw !== null || !sameResult(want, got)) { out.differences++; out.first ??= threw !== null ? `${label} threw: ${threw}` : label; }
  }
  return out;
}

/** The exported names of a module namespace or object, sorted. */
export const exportNames = (m: Record<string, any>): string[] => Object.keys(m).sort();
