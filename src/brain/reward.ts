/**
 * Recompensa por reducción de drive (el refuerzo de Creatures, simplificado).
 *
 * En el original, el aprendizaje lo disparan los neuroemisores de recompensa
 * (químico 204) y castigo (205). Todavía no modelamos esos emisores dedicados;
 * la señal se deriva de la bioquímica observable: se define un MALESTAR
 * (0 = todo satisfecho, 1 = todo al peor nivel) como mezcla lineal de drives
 * aversivos y deseables, y la recompensa de un paso es la REDUCCIÓN de ese
 * malestar, escalada y recortada a [-1, 1].
 *
 * Módulo puro: no conoce el cerebro ni el motor. Lo consume `main.ts` para
 * llamar a `BrainV05Adapter.reinforce()` y lo cubren `tests/reward.test.ts`.
 *
 * HONESTIDAD SOBRE EL ESTADO ACTUAL: `src/world/` ya produce efectos de comida,
 * juego, luz y descanso, pero el mundo sigue siendo abstracto y las magnitudes
 * no están calibradas. La señal puede ser contingente con el verbo, pero aún no
 * valida una tarea de navegación/aprendizaje real. Los botones premio/castigo
 * permiten supervisar decisiones mientras se completa el mundo espacial.
 */
import type { DriveId, DriveState } from '../contracts/types';

/**
 * Pesos del malestar por drive. Positivo = drive AVERSIVO (sube el malestar
 * con su nivel); negativo = drive DESEABLE (sube el malestar cuando falta).
 * Extensible: añadir una entrada no toca ninguna fórmula.
 */
export const DEFAULT_DISCOMFORT_WEIGHTS: Readonly<Record<string, number>> = {
  hambre: 1,
  sueno: 1,
  aburrimiento: 1,
  miedo: 1,
  energia: -1,
  confort: -1,
  vinculo: -1,
} as const;

/**
 * Ganancia de la recompensa: cuánta reducción de malestar hace falta para
 * saturar a ±1. Los drives se mueven ~0.03/s, así que con gain = 6 un cambio
 * de 0.16 en el malestar ya es un premio/castigo completo.
 */
export const DEFAULT_REWARD_GAIN = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return clamp(value, 0, 1);
}

/**
 * Malestar normalizado 0..1 de un snapshot de drives.
 * `Σ (w>0 ? w·nivel : |w|·(1−nivel)) / Σ|w|`. Drive ausente ⇒ nivel 0 (para un
 * drive deseable cuenta como insatisfecho). Pesos vacíos ⇒ malestar 0.
 * @throws RangeError si algún peso no es un número finito.
 */
export function driveDiscomfort(
  drives: Partial<Record<DriveId, DriveState>>,
  weights: Readonly<Record<string, number>> = DEFAULT_DISCOMFORT_WEIGHTS,
): number {
  let total = 0;
  let norm = 0;
  for (const [id, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight)) {
      throw new RangeError(`Peso de malestar no finito para «${id}»: ${String(weight)}`);
    }
    if (weight === 0) continue;
    const level = clamp01(drives[id]?.level ?? 0);
    total += weight > 0 ? weight * level : -weight * (1 - level);
    norm += Math.abs(weight);
  }
  return norm > 0 ? clamp01(total / norm) : 0;
}

/**
 * Recompensa de un paso: `clamp((malestarAntes − malestarDespués) · gain, -1, 1)`.
 * Positiva si el malestar BAJA (la criatura mejoró), negativa si sube.
 * @throws RangeError si los malestares o la ganancia no son finitos.
 */
export function driveReductionReward(
  discomfortBefore: number,
  discomfortAfter: number,
  gain: number = DEFAULT_REWARD_GAIN,
): number {
  for (const [label, value] of [
    ['malestarAntes', discomfortBefore],
    ['malestarDespués', discomfortAfter],
    ['gain', gain],
  ] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`${label} no finito: ${String(value)}`);
  }
  return clamp((discomfortBefore - discomfortAfter) * gain, -1, 1);
}

/**
 * Señal neuromodulada O(1) inspirada en Schultz (1997) (`docs/VISION-SUPER-BESTIA.md` §2):
 * combina el error de predicción de recompensa (`rawReward − expectedReward`) con un
 * escalador global dopaminérgico (`0.5 + dopamina`), recortado al rango `[-1, 1]`.
 */
export function neuromodulatedReward(
  rawReward: number,
  dopamineLevel: number,
  expectedReward = 0,
): number {
  for (const [label, value] of [
    ['rawReward', rawReward],
    ['dopamineLevel', dopamineLevel],
    ['expectedReward', expectedReward],
  ] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`${label} no finito: ${String(value)}`);
  }
  const predictionError = rawReward - expectedReward;
  const modulator = 0.5 + clamp01(dopamineLevel);
  return clamp(predictionError * modulator, -1, 1);
}
