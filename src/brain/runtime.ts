/**
 * Composición del fenotipo y el adaptador del cerebro.
 *
 * La selección de cuatro genes reproduce provisionalmente las facetas del
 * prototipo (curiosidad, sociabilidad, resiliencia y apetito); se mantiene
 * configurable hasta que Tecnotron confirme el mapeo definitivo.
 */
import type { BrainKnobConfig, PhenotypeConfig } from '../contracts/igenome';
import type { BrainV05Like } from './brainv05-types';
import {
  BrainV05Adapter,
  genomeProvider,
  type BrainV05AdapterOptions,
  type StimuliProvider,
} from './adapter';

/** Superficie mínima que necesita la composición; Genome la implementa. */
export interface GenomeSource {
  getGene(id: string): number;
  getPhenotype(): PhenotypeConfig;
}

/** Orden provisional, inspirado en los cuatro genes del prototipo Bichito. */
export const DEFAULT_BRAIN_GENOME_INPUTS = [
  'alerta',
  'sociabilidad',
  'resiliencia',
  'metabolismo',
] as const;

export type BrainGenomeInputIds = readonly [string, string, string, string];
export type BrainFactory = (config: BrainKnobConfig) => BrainV05Like;

export interface BrainRuntimeOptions {
  /** Reemplazo del mapeo provisional hacia las 4 entradas genómicas. */
  genomeInputGenes?: BrainGenomeInputIds;
  /** Reemplazo opcional del mapeo provisional de estímulos químicos. */
  mapStimuli?: StimuliProvider;
}

export interface BrainRuntime {
  /** Implementación del contrato IBrain lista para usar en el bucle. */
  brain: BrainV05Adapter;
  /** El mismo fenotipo alimenta el motor y configura la fábrica del cerebro. */
  phenotype: PhenotypeConfig;
  /** Genes efectivamente enviados como vector al cerebro. */
  genomeInputGenes: BrainGenomeInputIds;
}

/**
 * Construye el cerebro con los knobs del genoma y enlaza las 4 entradas de
 * genoma al adaptador. `brainFactory` facilita sustituir el placeholder sin
 * filtrar detalles del modelo al resto de la simulación.
 */
export function createBrainRuntime(
  genome: GenomeSource,
  brainFactory: BrainFactory,
  options: BrainRuntimeOptions = {},
): BrainRuntime {
  const phenotype = genome.getPhenotype();
  const genomeInputGenes = options.genomeInputGenes ?? DEFAULT_BRAIN_GENOME_INPUTS;
  const adapterOptions: BrainV05AdapterOptions = {
    mapGenome: genomeProvider((id) => genome.getGene(id), genomeInputGenes),
  };
  if (options.mapStimuli) adapterOptions.mapStimuli = options.mapStimuli;

  const brain = brainFactory({ ...phenotype.brain });
  return {
    brain: new BrainV05Adapter(brain, adapterOptions),
    phenotype,
    genomeInputGenes,
  };
}
