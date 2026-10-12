/**
 * API pública del módulo de palabras/vocabulario (Fase vocab).
 * Importar desde '../vocab' o './vocab'.
 */
export { Vocabulary, normalizeWord, validateVocabConfig } from './vocabulary';
export {
  VOCAB_SCHEMA_VERSION,
  DEFAULT_VOCAB_CONFIG,
  type IVocab,
  type VocabConfig,
  type VocabEntry,
  type VocabStats,
} from '../contracts/ivocab';
