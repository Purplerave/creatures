/**
 * Contrato del módulo de palabras/vocabulario (Fase vocab).
 *
 * Asociación palabra→estímulo aprendida por repetición y **olvidada por el
 * tiempo**: cada refuerzo sube la confianza; cada tick la hace decaer si no
 * se refuerza. Determinista: sin aleatoriedad, mismo orden de llamadas ⇒
 * mismo estado bit a bit. Serializable: el vocabulario completo se guarda y
 * carga con `serialize()`/`deserialize()`.
 *
 * Referencia de lógica: `bichito.html` (`teachAssociation`: reps × 34 ⇒
 * 3 repeticiones = aprendida) **más** el decaimiento temporal que añade
 * este módulo. Fórmulas exactas en `docs/VOCAB.md`.
 */

/** Versión del esquema serializado (romper compat ⇒ subir este número). */
export const VOCAB_SCHEMA_VERSION = 1;

/** Una asociación palabra ↔ estímulo. */
export interface VocabEntry {
  /** Palabra normalizada (trim + espacios colapsados + minúsculas). */
  word: string;
  /** Id del estímulo asociado (cadena libre: 'comida', 'objeto:pelota'…). */
  stimulusId: string;
  /** Confianza 0..1 (1 = «aprendida» con el umbral por defecto). */
  confidence: number;
  /** Número de refuerzos (`teach`) recibidos. */
  reps: number;
  /** Tiempo simulado (segundos) del último refuerzo. */
  lastReinforcedAt: number;
  /** `confidence >= learnThreshold`; se recalcula en cada tick (puede CAER). */
  learned: boolean;
}

/**
 * Configuración del vocabulario.
 *
 * Por defecto (`DEFAULT_VOCAB_CONFIG`):
 * - `decayPerSecond: 0.05` — olvido lineal: −0.05 de confianza por segundo.
 * - `learnThreshold: 1.0` — para estar «aprendida» hace falta confianza 1.0
 *   (= 3 refuerzos con boost 0.34, ya que 3·0.34 = 1.02 se recorta a 1).
 * - `boostPerReinforcement: 0.34` — cada `teach` suma +0.34 (clamp a 1).
 * - `maxEntries: 100` — aforo máximo; al superarlo se expulsa la más débil.
 */
export interface VocabConfig {
  /** Olvido lineal por segundo de tiempo simulado (≥ 0). */
  decayPerSecond: number;
  /** Umbral de «aprendida» (0 < umbral ≤ 1). */
  learnThreshold: number;
  /** Confianza ganada por cada refuerzo (0 < boost ≤ 1). */
  boostPerReinforcement: number;
  /** Máximo de entradas simultáneas (entero ≥ 1). */
  maxEntries: number;
}

/** Configuración por defecto (ver JSDoc de VocabConfig). */
export const DEFAULT_VOCAB_CONFIG: VocabConfig = {
  decayPerSecond: 0.05,
  learnThreshold: 1.0,
  boostPerReinforcement: 0.34,
  maxEntries: 100,
};

/** Estadísticas del vocabulario. */
export interface VocabStats {
  /** Número de palabras distintas (una palabra puede ir a varios estímulos). */
  words: number;
  /** Entradas con `learned === true`. */
  learned: number;
  /** Total de entradas (palabra × estímulo). */
  total: number;
}

export interface IVocab {
  /**
   * Enseña/refuerza `word` asociándola a `stimulusId`.
   * Misma palabra + mismo estímulo ⇒ refuerzo de la entrada existente;
   * cualquier otra combinación ⇒ entrada nueva. Si el vocabulario está
   * lleno, se expulsa la entrada más débil antes de insertar.
   * @throws RangeError si la palabra o el estímulo están vacíos/inválidos.
   */
  teach(word: string, stimulusId: string): void;
  /**
   * Entradas de un estímulo, ordenadas por confianza descendente (empates:
   * orden alfabético de palabra). Devuelve copias; mutarlas no afecta al
   * módulo. Estímulo sin entradas ⇒ array vacío.
   */
  recall(stimulusId: string): VocabEntry[];
  /** Paso de simulación: avanza el reloj `dt` s y aplica el olvido. */
  tick(dt: number): void;
  /** JSON estable (mismo estado ⇒ misma cadena byte a byte). */
  serialize(): string;
  /**
   * Carga un JSON de `serialize()` en esta instancia.
   * @throws RangeError si el JSON es inválido o no cumple el contrato.
   */
  deserialize(json: string): void;
  /** Contadores actuales (ver VocabStats). */
  getStats(): VocabStats;
}

/**
 * MAPEO PROPUESTO a los futuros `BrainInputs` (NO cableado: esto vive en el
 * contrato como documento hasta que se acuerde en una revisión de proyecto y
 * se implemente en `src/brain/`). Idea: por cada estímulo, la fuerza de input asociada a una
 * palabra escuchada es la confianza de su entrada «aprendida»:
 *
 * ```
 * input(palabra) = entry(word, stimulusId)?.learned
 *                   ? entry.confidence   // 0..1 ya aprendido
 *                   : 0                  // aún no aprendida ⇒ nada
 * ```
 *
 * Discusión pendiente: si una palabra con varias entradas (varios estímulos)
 * dispara todas sus entradas aprendidas o solo la de mayor confianza
 * (recomendado: la de mayor confianza, desempate por orden alfabético de
 * `stimulusId`, para que el input sea determinista).
 */
