/**
 * Vocabulary — implementación determinista de IVocab (Fase vocab).
 *
 * Aprendizaje (refuerzo): `teach` suma `boostPerReinforcement` a la
 * confianza de la entrada (palabra+estímulo), con clamp a 1, y suma `reps`.
 *
 * Olvido (tick): avanza el reloj de simulación `dt` segundos y resta
 * `decayPerSecond · dt` a la confianza de cada entrada cuyo último refuerzo
 * es anterior al tick (**decaimiento lineal simple**, elegido y documentado
 * en docs/VOCAB.md). La confianza nunca baja de 0. `learned` se recalcula
 * en cada operación: puede CAER si el olvido cruza el umbral.
 *
 * Determinismo: cero `Math.random()`, cero I/O, cero tiempo real. Mismo
 * orden de llamadas + mismos dt ⇒ mismo estado bit a bit. El reloj solo
 * avanza dentro de `tick()`.
 *
 * Aforo: si `teach` supera `maxEntries` se expulsa la entrada más débil
 * (menor confianza; empate ⇒ menos refuerzos; empate ⇒ refuerzo más antiguo;
 * empate ⇒ la más antigua de inserción). La entrada que se enseña nunca se
 * expulsa: se inserta siempre.
 */
import type { IVocab, VocabConfig, VocabEntry, VocabStats } from '../contracts/ivocab';
import { DEFAULT_VOCAB_CONFIG, VOCAB_SCHEMA_VERSION } from '../contracts/ivocab';

/** Serialización estable de una Vocabulary. */
interface SerializedVocab {
  schemaVersion: number;
  config: VocabConfig;
  now: number;
  entries: VocabEntry[];
}

/**
 * Normaliza una palabra: trim + colapsa espacios + minúsculas (sin locale,
 * para que el resultado no dependa de la tabla ICU de cada sistema).
 */
export function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, ' ').toLowerCase();
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Valida la config y devuelve una copia completa con defaults aplicados. */
export function validateVocabConfig(config: Partial<VocabConfig> = {}): VocabConfig {
  const merged: VocabConfig = { ...DEFAULT_VOCAB_CONFIG, ...config };
  const { decayPerSecond, learnThreshold, boostPerReinforcement, maxEntries } = merged;
  if (!Number.isFinite(decayPerSecond) || decayPerSecond < 0) {
    throw new RangeError(`decayPerSecond inválido: ${decayPerSecond} (debe ser ≥ 0 y finito)`);
  }
  if (!Number.isFinite(learnThreshold) || learnThreshold <= 0 || learnThreshold > 1) {
    throw new RangeError(`learnThreshold inválido: ${learnThreshold} (debe estar en (0, 1])`);
  }
  if (!Number.isFinite(boostPerReinforcement) || boostPerReinforcement <= 0 || boostPerReinforcement > 1) {
    throw new RangeError(`boostPerReinforcement inválido: ${boostPerReinforcement} (debe estar en (0, 1])`);
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError(`maxEntries inválido: ${maxEntries} (entero ≥ 1)`);
  }
  return merged;
}

export class Vocabulary implements IVocab {
  private config: VocabConfig;
  /** Reloj de simulación (segundos). Solo avanza en tick(). */
  private now = 0;
  /** Insertion order ⇒ orden estable y serialización determinista. */
  private readonly entries = new Map<string, VocabEntry>();

  constructor(config: Partial<VocabConfig> = {}) {
    this.config = validateVocabConfig(config);
  }

  /** Config efectiva (copia inmutable). */
  getConfig(): VocabConfig {
    return { ...this.config };
  }

  /** Tiempo simulado acumulado (segundos). */
  getNow(): number {
    return this.now;
  }

  teach(word: string, stimulusId: string): void {
    if (typeof word !== 'string' || typeof stimulusId !== 'string') {
      throw new RangeError('teach espera (word: string, stimulusId: string)');
    }
    const normalized = normalizeWord(word);
    if (!normalized) throw new RangeError('teach: la palabra está vacía');
    if (!stimulusId.trim()) throw new RangeError('teach: stimulusId está vacío');

    const key = this.key(normalized, stimulusId);
    let entry = this.entries.get(key);
    if (!entry) {
      this.evictIfNeeded();
      entry = {
        word: normalized,
        stimulusId,
        confidence: 0,
        reps: 0,
        lastReinforcedAt: this.now,
        learned: false,
      };
      this.entries.set(key, entry);
    }
    entry.confidence = clamp01(entry.confidence + this.config.boostPerReinforcement);
    entry.reps += 1;
    entry.lastReinforcedAt = this.now;
    entry.learned = entry.confidence >= this.config.learnThreshold;
  }

  recall(stimulusId: string): VocabEntry[] {
    const matches = [...this.entries.values()].filter((e) => e.stimulusId === stimulusId);
    // Confianza descendente; empate ⇒ palabra ascendente (determinista).
    matches.sort((a, b) => b.confidence - a.confidence || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
    return matches.map((e) => ({ ...e }));
  }

  tick(dt: number): void {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) {
      throw new RangeError(`tick: dt inválido: ${dt} (número finito ≥ 0)`);
    }
    if (dt === 0) return;
    this.now += dt;
    for (const entry of this.entries.values()) {
      // Solo decae lo cuyo último refuerzo es anterior a este tick: un
      // refuerzo hecho en el instante actual nunca se resta.
      if (entry.lastReinforcedAt < this.now) {
        entry.confidence = Math.max(0, entry.confidence - this.config.decayPerSecond * dt);
      }
      // «Aprendida» se recalcula SIEMPRE: el olvido puede hacerla caer.
      entry.learned = entry.confidence >= this.config.learnThreshold;
    }
  }

  serialize(): string {
    const payload: SerializedVocab = {
      schemaVersion: VOCAB_SCHEMA_VERSION,
      config: { ...this.config },
      now: this.now,
      entries: [...this.entries.values()].map((e) => ({ ...e })),
    };
    return JSON.stringify(payload);
  }

  deserialize(json: string): void {
    if (typeof json !== 'string') throw new RangeError('deserialize espera un string JSON');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RangeError('JSON de vocabulario inválido');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('Vocabulario serializado debe ser un objeto JSON');
    }
    const candidate = parsed as Partial<SerializedVocab>;
    if (candidate.schemaVersion !== VOCAB_SCHEMA_VERSION) {
      throw new RangeError(
        `schemaVersion no soportada: ${candidate.schemaVersion} (soportada: ${VOCAB_SCHEMA_VERSION})`,
      );
    }
    if (typeof candidate.now !== 'number' || !Number.isFinite(candidate.now) || candidate.now < 0) {
      throw new RangeError(`Reloj serializado inválido: ${String(candidate.now)}`);
    }
    if (!Array.isArray(candidate.entries)) {
      throw new RangeError('entries serializado debe ser un array');
    }
    const config = validateVocabConfig(candidate.config ?? {});

    // Reconstruye validando cada entrada; rechaza duplicados y clamps.
    const restored = new Map<string, VocabEntry>();
    for (const raw of candidate.entries) {
      if (typeof raw !== 'object' || raw === null) throw new RangeError('Entrada serializada inválida');
      const e = raw as Partial<VocabEntry>;
      if (typeof e.word !== 'string' || !e.word) throw new RangeError('Entrada sin word válida');
      if (typeof e.stimulusId !== 'string' || !e.stimulusId) throw new RangeError('Entrada sin stimulusId válido');
      if (typeof e.confidence !== 'number' || !Number.isFinite(e.confidence)) {
        throw new RangeError(`Confianza inválida en «${e.word}»`);
      }
      if (typeof e.reps !== 'number' || !Number.isInteger(e.reps) || e.reps < 0) {
        throw new RangeError(`reps inválida en «${e.word}»`);
      }
      if (typeof e.lastReinforcedAt !== 'number' || !Number.isFinite(e.lastReinforcedAt) || e.lastReinforcedAt < 0) {
        throw new RangeError(`lastReinforcedAt inválido en «${e.word}»`);
      }
      const entry: VocabEntry = {
        word: e.word,
        stimulusId: e.stimulusId,
        confidence: clamp01(e.confidence),
        reps: e.reps,
        lastReinforcedAt: e.lastReinforcedAt,
        learned: e.confidence >= config.learnThreshold,
      };
      const key = this.key(entry.word, entry.stimulusId);
      if (restored.has(key)) throw new RangeError(`Entrada duplicada: «${entry.word}» + ${entry.stimulusId}`);
      restored.set(key, entry);
    }
    if (restored.size > config.maxEntries) {
      throw new RangeError(`entries (${restored.size}) supera maxEntries (${config.maxEntries})`);
    }

    this.config = config;
    this.now = candidate.now;
    this.entries.clear();
    for (const [key, entry] of restored) this.entries.set(key, entry);
  }

  getStats(): VocabStats {
    const distinctWords = new Set<string>();
    let learned = 0;
    for (const entry of this.entries.values()) {
      distinctWords.add(entry.word);
      if (entry.learned) learned += 1;
    }
    return { words: distinctWords.size, learned, total: this.entries.size };
  }

  /** Clave interna de una entrada: palabra y estímulo unidos sin ambigüedad. */
  private key(word: string, stimulusId: string): string {
    return `${stimulusId}\u0000${word}`;
  }

  /**
   * Expulsa la entrada más débil para hacer sitio. Orden: menor confianza →
   * menos refuerzos → lastReinforcedAt más antiguo → la insertada antes.
   * Determinista: recorre en orden de inserción y solo sustituye si gana.
   */
  private evictIfNeeded(): void {
    if (this.entries.size < this.config.maxEntries) return;
    let weakestKey: string | null = null;
    let weakest: VocabEntry | null = null;
    for (const [key, entry] of this.entries) {
      if (
        weakest === null ||
        entry.confidence < weakest.confidence ||
        (entry.confidence === weakest.confidence && entry.reps < weakest.reps) ||
        (entry.confidence === weakest.confidence &&
          entry.reps === weakest.reps &&
          entry.lastReinforcedAt < weakest.lastReinforcedAt)
      ) {
        weakestKey = key;
        weakest = entry;
      }
    }
    if (weakestKey !== null) this.entries.delete(weakestKey);
  }
}
