/**
 * Reacciones deterministas de primer orden.
 *
 * Dos familias:
 *
 * 1) Reacciones químicas (A → B): consumen A y producen B a razón
 *    k · [A] por segundo. Integración exacta por tick:
 *    Δ = A · (1 − e^(−k·dt)). Sin aleatoriedad.
 *
 * 2) Acoplamientos drive↔chemical: la derivada a la que el químico empuja un
 *    drive (gain · nivel, unidades de drive/segundo). El DATO vive en
 *    driveTable.ts (DriveDef.influences) — un drive nuevo solo toca esa tabla;
 *    aquí vive la función couplingRate() que el motor usa para sumarlos.
 *    Ejemplos (están en la tabla): hambre baja si glucosa alta (gain −2.5),
 *    curiosidad sube con dopamina (gain +2.0), miedo sube con cortisol (+2.5).
 */
import type { ChemicalId } from '../contracts/types';
import type { DriveDef } from './driveTable';

export interface ChemicalReaction {
  /** Reactivo que se consume. */
  from: ChemicalId;
  /** Producto que se genera. */
  to: ChemicalId;
  /** Constante de velocidad por segundo (≥ 0), primer orden. */
  k: number;
}

/** Reacciones del metabolismo de Fase 0. Añadir una = añadir una entrada. */
export const CHEMICAL_REACTIONS: ChemicalReaction[] = [
  // Cadena de recompensa social: dopamina → oxitocina → serotonina.
  { from: 'dopamina', to: 'oxitocina', k: 0.05 },
  { from: 'oxitocina', to: 'serotonina', k: 0.04 },
  // Fatiga no resuelta deriva en estrés.
  { from: 'adenosina', to: 'cortisol', k: 0.03 },
];

/**
 * Deriva total (drive/segundo) que un drive sufre en un instante:
 * deriva intrínseca + Σ gain · nivelQuímico. Determinista y lineal.
 *
 * @param def   definición del drive (tabla extensible)
 * @param chemicals niveles actuales de químicos
 */
export function couplingRate(def: DriveDef, chemicals: Record<ChemicalId, number>): number {
  let rate = def.decayPerSecond;
  for (const inf of def.influences) {
    const level = chemicals[inf.chemical];
    if (level === undefined) {
      throw new RangeError(`Drive ${def.id} influido por químico no registrado: ${inf.chemical}`);
    }
    rate += inf.gain * level;
  }
  return rate;
}

/**
 * Transferencia A→B durante dt con integración exponencial exacta:
 * Δ = A · (1 − e^(−k·dt)) (acotado al A disponible).
 */
export function reactionTransfer(levelFrom: number, k: number, dt: number): number {
  if (levelFrom <= 0 || k <= 0 || dt <= 0) return 0;
  const amount = levelFrom * (1 - Math.exp(-k * dt));
  return Math.min(levelFrom, Math.max(0, amount));
}
