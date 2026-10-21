/**
 * Contrato del módulo de genoma/mutación (Fase genoma + F2 «Genoma Creatures»).
 *
 * El genoma es una estructura serializable de genes normalizados (0..1), loci
 * estructurales opcionales (duplicación/omisión) y marcas epigenéticas de
 * metilación reversible (1 bit por locus) que configuran el fenotipo: los
 * efectos ya resueltos que ajustan el motor de bioquímica y la configuración
 * con la que se construye el cerebro.
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

/** Familias de genes inspiradas en el formato `.gen` de Creatures. */
export type GeneFamily = 'drive' | 'brain' | 'metabolism' | 'instinct' | 'pigment';

/**
 * Cabecera rica de gen (F2 «Genoma Creatures»): controla ontogenia,
 * mutabilidad ponderada (0..255) y protección frente a borrado/mutación.
 * Todos los campos son opcionales al registrar un gen para preservar 100 % la
 * ergonomía de `registerGene({ id, label, ... })`.
 */
export interface GeneHeader {
  /** Familia funcional del gen (por defecto `'brain'` si toca un knob, si no `'drive'`). */
  family?: GeneFamily;
  /** Edad simulada (segundos ≥ 0) a la que se enciende el gen (0 = activo al nacer). */
  switchOnTime?: number;
  /** Peso de mutabilidad 0..255 estilo Creatures (255 = paso completo). */
  mutability?: number;
  /** Gen crítico protegido: su copia primaria nunca puede omitirse/borrarse. */
  critical?: boolean;
  /** Si admite mutación puntual de parámetro (por defecto `true`). */
  mutable?: boolean;
  /** Si admite duplicación estructural en un nuevo locus (por defecto `true`). */
  dupable?: boolean;
  /** Si puede omitirse en mutación estructural (por defecto `!critical`). */
  deletable?: boolean;
  /** Si se expresa transcripcionalmente (por defecto `true`; `false` = pseudogén). */
  expressed?: boolean;
}

/** Cabecera de gen con todos los valores por defecto ya resueltos. */
export interface ResolvedGeneHeader {
  family: GeneFamily;
  switchOnTime: number;
  mutability: number;
  critical: boolean;
  mutable: boolean;
  dupable: boolean;
  deletable: boolean;
  expressed: boolean;
}

/**
 * Locus individual dentro de un genoma con estructura extendida (F2).
 * `copyIndex === 0` representa la copia ancestral; `copyIndex > 0` son
 * duplicados surgidos por mutación estructural (siempre mutables/eliminables
 * aunque el gen original sea `critical`).
 */
export interface GeneLocus {
  /** Identificador único y determinista del locus (p. ej. `metabolismo` o `metabolismo#1`). */
  locusId: string;
  /** Id del gen base en la tabla de genes. */
  geneId: string;
  /** Índice de copia (0 = copia primaria, ≥ 1 = duplicado). */
  copyIndex: number;
  /** Valor alélico normalizado en 0..1. */
  value: number;
  /** Marca epigenética reversible (true = silenciado por metilación sin alterar secuencia). */
  methylated: boolean;
}

/** Opciones de evaluación ontogenética/epigenética del fenotipo. */
export interface PhenotypeEvalOptions {
  /** Edad simulada actual de la criatura en segundos (`undefined` ⇒ sin filtro de edad). */
  ageSeconds?: number;
}

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
 * - `generation`, `loci`, `methylated`: metadatos opcionales F2 (omitidos en
 *   JSON cuando permanecen en su estado base para conservar compatibilidad
 *   exacta byte a byte con Fase genoma).
 */
export interface GenomeConfig {
  genes: { [geneId: string]: number };
  schemaVersion: number;
  seed: number;
  /** Generación en el linaje (1 por defecto al nacer de semilla). */
  generation?: number;
  /** Loci duplicados u omitidos producidos por mutación estructural F2. */
  loci?: GeneLocus[];
  /** Genes/loci silenciados por metilación epigenética reversible (1 bit). */
  methylated?: string[];
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
  getPhenotype(options?: PhenotypeEvalOptions): PhenotypeConfig;
}
