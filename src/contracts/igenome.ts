/**
 * Contrato del módulo de genoma/mutación (Fase genoma).
 *
 * El genoma es una estructura serializable de genes normalizados (0..1) que
 * configura el fenotipo: los efectos ya resueltos que ajustan el motor de
 * bioquímica y la configuración con la que se construye el cerebro.
 *
 * CAPA DE CONFIGURACIÓN: el phenotype NO modifica `driveTable.ts` ni el
 * cerebro — solo cambia los valores con los que se construyen (deltas sobre
 * `decayPerSecond` y knobs del cerebro). Sin phenotype el comportamiento es
 * idéntico al de Fase 0.
 */
import type { DriveId } from './types';

/** Versión del esquema de GenomeConfig (romper compat ⇒ subir este número). */
export const GENOME_SCHEMA_VERSION = 1;

/** Knobs de configuración del cerebro que el genoma puede ajustar. */
export type BrainKnobId = 'hiddenSize' | 'epsilonInitial' | 'learningRate';

/**
 * Configuración del cerebro derivada del genoma (opcional: solo los knobs
 * presentes). Quien construya el cerebro la aplica como constructor options;
 * este módulo no importa `src/brain/`.
 */
export interface BrainKnobConfig {
  /** Tamaño de la capa oculta (entero ≥ 1). */
  hiddenSize?: number;
  /** ε inicial del ε-greedy (0..1). */
  epsilonInitial?: number;
  /** Tasa de aprendizaje (> 0). */
  learningRate?: number;
}

/**
 * Fenotipo: efectos ya resueltos del genoma.
 *
 * - `driveDecayDeltas`: delta RELATIVO por drive. El motor aplica
 *   `decayEfectivo = decayPerSecond · clamp(1 + delta, 0, 4)`.
 *   Delta 0 ⇒ sin efecto (gen en su valor neutral).
 * - `brain`: knobs con los que construir el cerebro. Este módulo solo los
 *   calcula; el motor de bioquímica los ignora.
 */
export interface PhenotypeConfig {
  /** Delta relativo de decayPerSecond por drive (0 = neutro). */
  driveDecayDeltas: Partial<Record<DriveId, number>>;
  /** Knobs de configuración del cerebro. */
  brain: BrainKnobConfig;
}

/**
 * Configuración serializable de un genoma.
 *
 * - `genes`: mapa gen → valor normalizado 0..1 (con su rango por gen).
 * - `schemaVersion`: versión del esquema (VER `GENOME_SCHEMA_VERSION`).
 * - `seed`: semilla creadora del genoma (uint32). `mutate()` no la cambia:
 *   identifica la estirpe, no la última mutación.
 */
export interface GenomeConfig {
  genes: { [geneId: string]: number };
  schemaVersion: number;
  seed: number;
}

/**
 * Contrato del genoma.
 *
 * Invariantes:
 * - `serialize()` es estable: mismos genes ⇒ mismo string (claves ordenadas).
 * - `mutate(seed, intensity)` es determinista: mismo genoma + misma semilla +
 *   misma intensidad ⇒ hijo idéntico byte a byte. Sin `Math.random()`.
 * - Todos los valores de gen viven en 0..1 (clamp en mutación y saneado).
 */
export interface IGenome {
  /** Serializa a JSON estable (claves de genes ordenadas). */
  serialize(): string;

  /**
   * Valida y carga un JSON de genoma: aplica la config a esta instancia y la
   * devuelve normalizada.
   * @throws RangeError si el JSON es inválido o fuera de contrato.
   */
  deserialize(json: string): GenomeConfig;

  /**
   * Mutación determinista en el sitio: cada gen recibe un delta derivado del
   * PRNG (mulberry32) escalado por `intensity`, recortado a 0..1.
   * @param seed semilla de mutación (uint32).
   * @param intensity intensidad 0..1 (0 ⇒ sin cambios; se recorta a 0..1).
   * @throws RangeError si seed/intensity no son finitos.
   */
  mutate(seed: number, intensity: number): void;

  /**
   * Valor actual de un gen (0..1).
   * Gen registrado sin instanciar ⇒ su peso por defecto; desconocido ⇒ RangeError.
   */
  getGene(id: string): number;

  /** Resuelve el fenotipo: genes → deltas de decay + knobs del cerebro. */
  getPhenotype(): PhenotypeConfig;
}
