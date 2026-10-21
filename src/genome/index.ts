/**
 * API pública del módulo de genoma (Fase genoma + F2 «Genoma Creatures»).
 * Importar desde '../genome' o './genome'.
 */
export {
  Genome,
  MUTATION_STEP,
  DEFAULT_DUPLICATION_RATE,
  DEFAULT_DELETION_RATE,
  MAX_COPIES_PER_GENE,
  type StructuralMutationOptions,
  type StructuralMutationReport,
} from './genome';
export {
  registerGene,
  getGeneDef,
  listGeneDefs,
  hasGene,
  resolveGeneHeader,
  MAX_GENE_MUTABILITY,
  type GeneDef,
  type DriveGeneEffect,
  type BrainGeneEffect,
} from './genes';
export { mulberry32, normalizeSeed, signedDelta, SEED_BITS } from './prng';
export {
  computePhenotype,
  decayDeltaForDrive,
  NEUTRAL_GENE,
  type PhenotypeContext,
} from './phenotype';
export {
  AMINO_ACIDS,
  CODON_TABLE,
  NUCLEOTIDES,
  STOP_AMINO_INDEX,
  codonIndex,
  computeProteinFingerprint,
  encodeAllelesToOrf,
  mutateDnaBase,
  sanitizeDna,
  synonymousCodonsFor,
  translateCodon,
  translateDna,
  type AminoAcidCode,
  type Nucleotide,
  type PointMutationOutcome,
  type ProteinFingerprint,
} from './molecular';
export {
  GENOME_SCHEMA_VERSION,
  type GenomeConfig,
  type GeneFamily,
  type GeneHeader,
  type GeneLocus,
  type IGenome,
  type PhenotypeConfig,
  type PhenotypeEvalOptions,
  type ResolvedGeneHeader,
  type BrainKnobConfig,
  type BrainKnobId,
} from '../contracts/igenome';
