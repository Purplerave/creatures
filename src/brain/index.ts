/**
 * Superficie pública del módulo cerebro (D2): punto de importación único
 * para consumidores que no deben depender de los ficheros internos.
 *
 * No se re-exporta `stub.ts` (histórico de Fase 0, no forma parte de la
 * superficie actual).
 */
export {
  BrainV05Adapter,
  DRIVE_ORDER,
  GENOME_DEFAULT,
  STIMULUS_CHEMICALS,
  genomeProvider,
} from './adapter';
export type {
  BrainV05AdapterOptions,
  GenomeProvider,
  StimuliProvider,
} from './adapter';
export { DEFAULT_BRAIN_GENOME_INPUTS, createBrainRuntime } from './runtime';
export type {
  BrainFactory,
  BrainGenomeInputIds,
  BrainRuntime,
  BrainRuntimeOptions,
  GenomeSource,
} from './runtime';
export { PlaceholderBrain } from './placeholder-brain';
export type {
  BrainDebugState,
  BrainV05Input,
  BrainV05Like,
  BrainV05Result,
} from './brainv05-types';
