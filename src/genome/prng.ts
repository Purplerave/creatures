/**
 * PRNG determinista del núcleo del genoma (mulberry32, semilla uint32).
 *
 * Regla de proyecto: NADA de `Math.random()` en el núcleo — un mismo genoma
 * con la misma semilla siempre produce el mismo descendiente, en cualquier
 * máquina y en cualquier orden de ejecución.
 */

/** Tamaño de semilla aceptado (32 bits, sin signo). */
export const SEED_BITS = 32;

/**
 * Normaliza cualquier número a semilla uint32 (operación `>>> 0`).
 * @throws RangeError si el valor no es finito.
 */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`Semilla no finita: ${seed}`);
  }
  return seed >>> 0;
}

/**
 * mulberry32: PRNG de 32 bits, rápido y con buen embarajado para uso general.
 * Devuelve una función que entrega floats uniformes en [0, 1).
 *
 * @param seed semilla uint32 (se normaliza con `normalizeSeed`).
 * @returns función generadora de números aleatorios determinista.
 */
export function mulberry32(seed: number): () => number {
  let a = normalizeSeed(seed);
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Delta simétrico en [-1, 1) a partir de un PRNG, nunca exactamente 0
 * (garantiza que intensity > 0 mueve al menos un gen desde un valor interior).
 */
export function signedDelta(rng: () => number): number {
  const u = rng() * 2 - 1;
  return u === 0 ? 1 / 2147483648 : u;
}
