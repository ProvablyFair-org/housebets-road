// Resolve hook: a relative import without an extension ("./stats") resolves to the .ts file beside it. The vendored
// framework rule src/rtp-claim.ts imports './rtp-claim-switch' that way and must stay byte-identical, so the package
// runs on Node 22 built-ins (--experimental-strip-types) through this hook instead of a TypeScript toolchain.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
}
