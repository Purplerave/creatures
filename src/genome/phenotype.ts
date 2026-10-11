/**
 * Fenotipo: resolución genes → efectos (PhenotypeConfig).
 *
 * FÓRMULA (documentada en docs/GENOME.md):
 *
 * 1) Drives — delta relativo acumulado por drive:
 *
 *      delta(d) = Σ_ genes g que afectan a d   (2·valor_g − 1) · peso(g→d)
 *
 *    valor_g ∈ [0,1] con neutral en 0.5 ⇒ (2·0.5 − 1) = 0. Un gen a 1 aporta
 *    +peso; a 0, −peso. El motor (o quien construya otro motor) aplica:
 *
 *      decayEfectivo(d) = decayPerSecond(d) · clamp(1 + delta(d), 0, 4)
 *
 *    Ej.: metabolismo 0.8 ⇒ delta hambre = (2·0.8 − 1)·0.4 = +0.16 ⇒
 *    decay hambre = 0.03 · 1.16 = 0.0348/s.
 *
 * 2) Cerebro — interpolación lineal dentro del rango del knob:
 *
 *      knob = min + valor_g · (max − min)          (hiddenSize se redondea)
 *
 * Solo se calcula: no modifica driveTable.ts ni el cerebro.
 */
import type { PhenotypeConfig, BrainKnobConfig } from '../contracts/igenome';
import { listGeneDefs, type GeneDef } from './genes';

/** Valor neutro de un gen (delta 0 sobre los drives). */
export const NEUTRAL_GENE = 0.5;

/** Multiplicador de decay acotado a [0, 4] (nunca invierte el signo base). */
export const MIN_DECAY_MULTIPLIER = 0;
export const MAX_DECAY_MULTIPLIER = 4;

/**
 * Calcula el delta relativo de decayPerSecond de un drive sumando los
 * efectos de todos los genes dados.
 */
export function decayDeltaForDrive(defs: GeneDef[], valueOf: (id: string) => number, driveId: string): number {
  let delta = 0;
  for (const def of defs) {
    for (const effect of def.drives ?? []) {
      if (effect.driveId !== driveId) continue;
      delta += (2 * valueOf(def.id) - 1) * effect.weight;
    }
  }
  return delta;
}

/**
 * Resuelve el fenotipo completo.
 *
 * @param valueOf valor actual de un gen (registrado ⇒ su valor o default;
 *   gen sin registrar ⇒ se asume su default porque no tiene efectos conocidos).
 */
export function computePhenotype(valueOf: (id: string) => number): PhenotypeConfig {
  const defs = listGeneDefs();

  // Drives: recoge los ids afectados por cualquier gen registrado.
  const driveDecayDeltas: PhenotypeConfig['driveDecayDeltas'] = {};
  const affectedDrives = new Set<string>();
  for (const def of defs) {
    for (const effect of def.drives ?? []) affectedDrives.add(effect.driveId);
  }
  for (const driveId of affectedDrives) {
    driveDecayDeltas[driveId] = decayDeltaForDrive(defs, valueOf, driveId);
  }

  // Cerebro: último gen registrado que toca cada knob gana (los semilla no
  // compiten: un knob por gen).
  const brain: BrainKnobConfig = {};
  for (const def of defs) {
    const effect = def.brain;
    if (!effect) continue;
    const value = valueOf(def.id);
    const [min, max] = effect.range;
    const raw = min + value * (max - min);
    if (effect.knob === 'hiddenSize') {
      brain.hiddenSize = Math.max(1, Math.round(raw));
    } else if (effect.knob === 'epsilonInitial') {
      brain.epsilonInitial = Math.min(1, Math.max(0, raw));
    } else {
      brain.learningRate = raw;
    }
  }

  return { driveDecayDeltas, brain };
}
