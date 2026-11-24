// node --experimental-strip-types --import ./scripts/ts-resolve.mjs <file.ts>  (see ts-hooks.mjs)
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
