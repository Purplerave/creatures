/**
 * Fenotipo: resolución genes → efectos (PhenotypeConfig), con soporte para
 * ontogenia (`switchOnTime`), expresión (`expressed`), metilación epigenética
 * reversible y dosificación aditiva de loci duplicados (F2 Creatures).
 *
 * FÓRMULA (documentada en docs/GENOME.md):
 *
 * 1) Drives — delta relativo acumulado por drive:
 *
 *      delta(d) = Σ_ loci activos g→d   (2·valor_locus − 1) · peso(g→d)
 *
 *    Un locus inactivo (no expresado, metilado, omitido o con
 *    `ageSeconds < switchOnTime`) aporta 0 (equivalente al valor neutro 0.5).
 *
 * 2) Cerebro — interpolación lineal dentro del rango del knob:
 *
 *      knob = min + valorEfectivo_g · (max − min)   (hiddenSize se redondea)
 *
 *    Si un gen de knob está silenciado o tiene copias duplicadas activas, su
 *    valor efectivo es la media de sus copias activas (o 0.5 neutro si ninguna
 *    copia está activa).
 *
 * Solo se calcula: no modifica driveTable.ts ni el cerebro.
 */
import type { PhenotypeConfig, BrainKnobConfig, GeneLocus } from '../contracts/igenome';
import { listGeneDefs, resolveGeneHeader, type GeneDef } from './genes';

/** Valor neutro de un gen (delta 0 sobre los drives). */
export const NEUTRAL_GENE = 0.5;

/** Multiplicador de decay acotado a [0, 4] (nunca invierte el signo base). */
export const MIN_DECAY_MULTIPLIER = 0;
export const MAX_DECAY_MULTIPLIER = 4;

/** Contexto opcional de expresión genética (F2 Creatures + epigenética). */
export interface PhenotypeContext {
  /** Edad simulada actual de la criatura en segundos (`undefined` ⇒ todos los `switchOnTime` encendidos). */
  ageSeconds?: number;
  /** Loci explícitos si el genoma ha sufrido duplicación u omisión estructural. */
  loci?: readonly GeneLocus[];
  /** Conjunto de ids (gen o locus) silenciados por metilación epigenética. */
  methylated?: ReadonlySet<string>;
}

function isGeneSwitchedOn(def: GeneDef, ageSeconds?: number): boolean {
  const header = resolveGeneHeader(def);
  if (!header.expressed) return false;
  if (ageSeconds !== undefined && ageSeconds < header.switchOnTime) return false;
  return true;
}

function activeValuesForGene(
  def: GeneDef,
  valueOf: (id: string) => number,
  context?: PhenotypeContext,
): number[] {
  if (!isGeneSwitchedOn(def, context?.ageSeconds)) return [];
  const methylated = context?.methylated;

  if (context?.loci) {
    const matching = context.loci.filter((locus) => locus.geneId === def.id);
    return matching
      .filter((locus) => !locus.methylated && !methylated?.has(locus.locusId) && !methylated?.has(def.id))
      .map((locus) => locus.value);
  }

  if (methylated?.has(def.id)) return [];
  return [valueOf(def.id)];
}

/**
 * Calcula el delta relativo de decayPerSecond de un drive sumando los
 * efectos de todos los genes/loci activos dados.
 */
export function decayDeltaForDrive(
  defs: GeneDef[],
  valueOf: (id: string) => number,
  driveId: string,
  context?: PhenotypeContext,
): number {
  let delta = 0;
  for (const def of defs) {
    const activeValues = activeValuesForGene(def, valueOf, context);
    if (activeValues.length === 0) continue;
    for (const effect of def.drives ?? []) {
      if (effect.driveId !== driveId) continue;
      for (const val of activeValues) {
        delta += (2 * val - 1) * effect.weight;
      }
    }
  }
  return delta;
}

/**
 * Resuelve el fenotipo completo.
 *
 * @param valueOf valor actual de un gen (registrado ⇒ su valor o default;
 *   gen sin registrar ⇒ se asume su default porque no tiene efectos conocidos).
 * @param context opciones ontogenéticas (`ageSeconds`), loci estructurales y metilación.
 */
export function computePhenotype(
  valueOf: (id: string) => number,
  context?: PhenotypeContext,
): PhenotypeConfig {
  const defs = listGeneDefs();

  // Drives: recoge los ids afectados por cualquier gen registrado.
  const driveDecayDeltas: PhenotypeConfig['driveDecayDeltas'] = {};
  const affectedDrives = new Set<string>();
  for (const def of defs) {
    for (const effect of def.drives ?? []) affectedDrives.add(effect.driveId);
  }
  for (const driveId of affectedDrives) {
    driveDecayDeltas[driveId] = decayDeltaForDrive(defs, valueOf, driveId, context);
  }

  // Cerebro: último gen registrado que toca cada knob gana.
  const brain: BrainKnobConfig = {};
  for (const def of defs) {
    const effect = def.brain;
    if (!effect) continue;
    const activeValues = activeValuesForGene(def, valueOf, context);
    const value =
      activeValues.length > 0
        ? activeValues.reduce((sum, item) => sum + item, 0) / activeValues.length
        : NEUTRAL_GENE;
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
