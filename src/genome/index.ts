/**
 * API pública del módulo de genoma (Fase genoma).
 * Importar desde '../genome' o './genome'.
 */
export { Genome, MUTATION_STEP } from './genome';
export {
  registerGene,
  getGeneDef,
  listGeneDefs,
  hasGene,
  type GeneDef,
  type DriveGeneEffect,
  type BrainGeneEffect,
} from './genes';
export { mulberry32, normalizeSeed, signedDelta, SEED_BITS } from './prng';
export { computePhenotype, decayDeltaForDrive, NEUTRAL_GENE } from './phenotype';
export {
  GENOME_SCHEMA_VERSION,
  type GenomeConfig,
  type IGenome,
  type PhenotypeConfig,
  type BrainKnobConfig,
  type BrainKnobId,
} from '../contracts/igenome';
