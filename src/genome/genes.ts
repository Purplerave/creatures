/**
 * Tabla extensible de genes (Fase genoma: 9 genes semilla + cabeceras F2 Creatures).
 *
 * Principio acordado (mismo criterio que `registerDrive`): añadir un gen =
 * añadir una fila con `registerGene()` — NO se toca genome.ts, phenotype.ts,
 * engine.ts ni el cerebro.
 *
 * Campos de GeneDef:
 * - defaultWeight: valor 0..1 con el que arranca un genoma que no lo trae.
 * - range: [min, máx] de saneado del valor del gen (subconjunto de 0..1).
 * - drives: efectos sobre drives ⇒ delta relativo de decayPerSecond
 *   (ver phenotype.ts: delta = (2·valor − 1) · weight).
 * - brain: efecto sobre un knob del cerebro ⇒ valor = min + valor·(max−min).
 * - header (opcional, F2): familia, `switchOnTime` ontogenético, peso de
 *   mutabilidad `0..255` y flags `critical`/`mutable`/`dupable`/`deletable`/`expressed`.
 */
import type { DriveId } from '../contracts/types';
import type { BrainKnobId, GeneHeader, ResolvedGeneHeader } from '../contracts/igenome';

/** Peso máximo de mutabilidad en escala Creatures (1 byte sin signo: 0..255). */
export const MAX_GENE_MUTABILITY = 255;

/** Efecto de un gen sobre el `decayPerSecond` de un drive. */
export interface DriveGeneEffect {
  /** Drive afectado (debe estar registrado en driveTable). */
  driveId: DriveId;
  /**
   * Peso máximo: delta relativo a gen = 1 (p. ej. 0.4 ⇒ ×1.4 el decay).
   * Signo: positivo acelera la deriva del drive; negativo la frena.
   */
  weight: number;
}

/** Efecto de un gen sobre un knob de configuración del cerebro. */
export interface BrainGeneEffect {
  /** Knob afectado. */
  knob: BrainKnobId;
  /** Rango [min, máx] del knob (gen 0 ⇒ min, gen 1 ⇒ max). */
  range: [number, number];
}

export interface GeneDef {
  /** Id del gen (cadena libre, sin espacios). Único en el registro. */
  id: string;
  /** Etiqueta legible para UI/depuración. */
  label: string;
  /** Descripción corta del gen (para docs/UI). */
  description: string;
  /** Valor 0..1 por defecto (0.5 = neutro para efectos de drive). */
  defaultWeight: number;
  /** Saneado [min, máx] dentro de 0..1. */
  range: [number, number];
  /** Drives afectados (delta relativo de decayPerSecond). */
  drives?: DriveGeneEffect[];
  /** Knob de cerebro afectado (como mucho uno por gen). */
  brain?: BrainGeneEffect;
  /** Cabecera estilo Creatures (F2): ontogenia, protección crítica y flags. */
  header?: GeneHeader;
}

/** Resuelve y valida una cabecera de gen con sus valores por defecto. */
export function resolveGeneHeader(def: Pick<GeneDef, 'id' | 'brain' | 'header'>): ResolvedGeneHeader {
  const raw = def.header ?? {};
  const family = raw.family ?? (def.brain ? 'brain' : 'drive');
  const switchOnTime = raw.switchOnTime ?? 0;
  if (!Number.isFinite(switchOnTime) || switchOnTime < 0) {
    throw new RangeError(`switchOnTime inválido para ${def.id}: ${String(raw.switchOnTime)} (debe ser ≥ 0)`);
  }
  const mutability = raw.mutability ?? MAX_GENE_MUTABILITY;
  if (!Number.isFinite(mutability) || mutability < 0 || mutability > MAX_GENE_MUTABILITY) {
    throw new RangeError(`mutability fuera de 0..255 para ${def.id}: ${String(raw.mutability)}`);
  }
  const critical = Boolean(raw.critical ?? false);
  const mutable = raw.mutable ?? true;
  const dupable = raw.dupable ?? true;
  // Regla no negociable #2 (VISION-SUPER-BESTIA.md): un gen crítico primario nunca es eliminable.
  const deletable = critical ? false : (raw.deletable ?? true);
  const expressed = raw.expressed ?? true;
  return {
    family,
    switchOnTime,
    mutability: Math.round(mutability),
    critical,
    mutable,
    dupable,
    deletable,
    expressed,
  };
}

/** Registro vivo. Añade con registerGene(); léelo con listGeneDefs(). */
const registry = new Map<string, GeneDef>();

/** Registra un gen nuevo. Único por id; duplicado ⇒ Error; datos inválidos ⇒ RangeError. */
export function registerGene(def: GeneDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Gen duplicado en la tabla: ${def.id}`);
  }
  if (!def.id || /\s/.test(def.id)) {
    throw new RangeError(`Id de gen inválido: «${def.id}» (vacío o con espacios)`);
  }
  const [min, max] = def.range;
  if (!(min >= 0 && max <= 1 && min <= max)) {
    throw new RangeError(`Rango inválido para ${def.id}: [${min}, ${max}] (debe estar en 0..1)`);
  }
  if (!Number.isFinite(def.defaultWeight) || def.defaultWeight < min || def.defaultWeight > max) {
    throw new RangeError(`defaultWeight fuera de rango para ${def.id}: ${def.defaultWeight}`);
  }
  resolveGeneHeader(def);
  registry.set(def.id, def);
}

/** Lee una definición. Id desconocido ⇒ RangeError. */
export function getGeneDef(id: string): GeneDef {
  const def = registry.get(id);
  if (!def) throw new RangeError(`Gen no registrado: ${id}`);
  return def;
}

/** Snapshot de todas las definiciones (orden de registro). */
export function listGeneDefs(): GeneDef[] {
  return [...registry.values()];
}

/** ¿Está registrado? (útil para validación/tests). */
export function hasGene(id: string): boolean {
  return registry.has(id);
}

// ---------------------------------------------------------------------------
// Los 9 genes semilla de la Fase genoma, enriquecidos con cabeceras F2.
// Todos arrancan con mutability 255, switchOnTime 0 y expressed true para que
// el comportamiento base sea 100 % idéntico bit a bit a Fase genoma.
// ---------------------------------------------------------------------------

const SEED_GENES: GeneDef[] = [
  // --- Genes de comportamiento (efectos sobre drives) ---------------------
  {
    id: 'metabolismo',
    label: 'Metabolismo',
    description: 'Ritmo al que sube la hambre y se consume la energía.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [
      { driveId: 'hambre', weight: 0.4 }, // gen 1 ⇒ decay hambre ×1.4
      { driveId: 'energia', weight: 0.4 }, // gen 1 ⇒ energía cae ×1.4 más rápido
    ],
    header: { family: 'metabolism', critical: true, dupable: true },
  },
  {
    id: 'templanza',
    label: 'Templanza',
    description: 'Cuán rápido se disipa el miedo.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [{ driveId: 'miedo', weight: 0.5 }],
    header: { family: 'instinct' },
  },
  {
    id: 'sociabilidad',
    label: 'Sociabilidad',
    description: 'Cuánto se conserva el vínculo sin refuerzo social.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [{ driveId: 'vinculo', weight: -0.5 }], // gen 1 ⇒ el vínculo decae a la mitad
    header: { family: 'instinct' },
  },
  {
    id: 'alerta',
    label: 'Alerta',
    description: 'Mantiene la curiosidad y frena el aburrimiento.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [
      { driveId: 'curiosidad', weight: -0.4 },
      { driveId: 'aburrimiento', weight: -0.3 },
    ],
    header: { family: 'drive' },
  },
  {
    id: 'calma',
    label: 'Calma',
    description: 'Conserva el confort y acumula sueño más deprisa.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [
      { driveId: 'confort', weight: -0.4 },
      { driveId: 'sueno', weight: 0.3 },
    ],
    header: { family: 'drive' },
  },
  {
    id: 'resiliencia',
    label: 'Resiliencia',
    description: 'Disipa el miedo y sostiene el confort bajo estrés.',
    defaultWeight: 0.5,
    range: [0, 1],
    drives: [
      { driveId: 'miedo', weight: 0.4 },
      { driveId: 'confort', weight: -0.3 },
    ],
    header: { family: 'metabolism' },
  },
  // --- Genes de configuración del cerebro (knobs) -------------------------
  {
    id: 'capacidad',
    label: 'Capacidad',
    description: 'Tamaño de la capa oculta de la red.',
    defaultWeight: 0.5,
    range: [0, 1],
    brain: { knob: 'hiddenSize', range: [4, 64] },
    header: { family: 'brain', critical: true, dupable: true },
  },
  {
    id: 'exploracion',
    label: 'Exploración',
    description: 'ε inicial del ε-greedy (curiosidad de arranque).',
    defaultWeight: 0.5,
    range: [0, 1],
    brain: { knob: 'epsilonInitial', range: [0.05, 0.6] },
    header: { family: 'brain' },
  },
  {
    id: 'aprendizaje',
    label: 'Aprendizaje',
    description: 'Tasa de aprendizaje del cerebro.',
    defaultWeight: 0.5,
    range: [0, 1],
    brain: { knob: 'learningRate', range: [0.01, 0.3] },
    header: { family: 'brain', critical: true, dupable: true },
  },
];

for (const def of SEED_GENES) registerGene(def);
