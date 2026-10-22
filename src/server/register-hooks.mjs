/**
 * Hook de resolución para ejecutar el código TS del repo con
 * `node --experimental-strip-types` (Node ≥ 24).
 *
 * POR QUÉ EXISTE: el proyecto usa importadores SIN extensión
 * (`import { BiochemEngine } from '../biochem'`), que Vite/vitest/tsc
 * resuelven solos, pero el ESM de Node exige la ruta completa. Este hook
 * reintenta la resolución añadiendo `.ts` o `/index.ts` cuando el importador
 * es relativo. Cero dependencias (usa solo `node:module`).
 *
 * Uso: `node --experimental-strip-types --import ./src/server/register-hooks.mjs src/server/index.ts`
 * (equivale al script `npm run server`).
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUFFIXES = ['.ts', '/index.ts'];

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
        const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
        const basePath = resolvePath(dirname(parentPath), specifier);
        for (const suffix of SUFFIXES) {
          const candidate = `${basePath}${suffix}`;
          if (existsSync(candidate)) {
            return nextResolve(pathToFileURL(candidate).href, context);
          }
        }
      }
      throw error;
    }
  },
});
