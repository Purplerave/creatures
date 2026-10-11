/**
 * Tabla extensible de drives (Fase 0: 8 drives).
 *
 * Principio acordado: añadir un drive = añadir una entrada al registro
 * con `registerDrive()` (antes de construir el motor). NO hay que tocar
 * engine.ts, reactions.ts ni ningún otro módulo.
 *
 * Campos:
 * - decayPerSecond: deriva intrínseca firmada por segundo (positivo sube,
 *   negativo decae). Es el "apetito" propio del drive sin químicos de por medio.
 * - clamp: [min, máx] — 0..1 por defecto; recorta el nivel en cada tick.
 * - influences: acoplamientos drive↔chemical. delta = gain * nivelQuímico
 *   (unidades de drive por segundo). Ej.: hambre baja si glucosa alta ⇒
 *   gain negativo sobre glucosa.
 */
import type { ChemicalId, DriveId } from '../contracts/types';

export interface DriveInfluence {
  /** Químico que empuja este drive. */
  chemical: ChemicalId;
  /** Deriva aportada por unidad de químico (drive/segundo). Negativo = baja. */
  gain: number;
}

export interface DriveDef {
  id: DriveId;
  /** Etiqueta legible para UI/depuración. */
  label: string;
  /** Deriva intrínseca por segundo (firmada). */
  decayPerSecond: number;
  /** Recorte de saturación del nivel. */
  clamp: [number, number];
  /** Acoplamientos con químicos (el motor los suma como gain * nivel). */
  influences: DriveInfluence[];
}

/** Registro vivo. Añade entradas con registerDrive(); léelo con listDriveDefs(). */
const registry = new Map<DriveId, DriveDef>();

/** Registra un drive nuevo. Único por id; duplicado ⇒ Error. */
export function registerDrive(def: DriveDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Drive duplicado en la tabla: ${def.id}`);
  }
  registry.set(def.id, def);
}

/** Lee una definición. Id desconocido ⇒ RangeError. */
export function getDriveDef(id: DriveId): DriveDef {
  const def = registry.get(id);
  if (!def) throw new RangeError(`Drive no registrado: ${id}`);
  return def;
}

/** Snapshot de todas las definiciones (orden de registro). */
export function listDriveDefs(): DriveDef[] {
  return [...registry.values()];
}

/** ¿Está registrado? (útil para validación en UI). */
export function hasDrive(id: DriveId): boolean {
  return registry.has(id);
}

// ---------------------------------------------------------------------------
// Los 8 drives de Fase 0. Añadir el nº 9 = registerDrive({…}) más abajo
// (o desde cualquier módulo, antes de instanciar BiochemEngine).
// ---------------------------------------------------------------------------

const SEED_DRIVES: DriveDef[] = [
  {
    id: 'hambre',
    label: 'Hambre',
    decayPerSecond: 0.03, // sube sola con el tiempo
    clamp: [0, 1],
    influences: [
      { chemical: 'glucosa', gain: -2.5 }, // hambre baja si glucosa alta
    ],
  },
  {
    id: 'energia',
    label: 'Energía',
    decayPerSecond: -0.02, // se consume sola
    clamp: [0, 1],
    influences: [
      { chemical: 'glucosa', gain: 2.0 }, // energía sube con glucosa
      { chemical: 'adenosina', gain: -1.5 }, // adenosina cansa
    ],
  },
  {
    id: 'sueno',
    label: 'Sueño',
    decayPerSecond: 0.02,
    clamp: [0, 1],
    influences: [
      { chemical: 'adenosina', gain: 2.5 }, // sueño sube con adenosina
    ],
  },
  {
    id: 'curiosidad',
    label: 'Curiosidad',
    decayPerSecond: -0.01,
    clamp: [0, 1],
    influences: [
      { chemical: 'dopamina', gain: 2.0 }, // curiosidad sube con dopamina
      { chemical: 'adenosina', gain: -0.5 },
    ],
  },
  {
    id: 'vinculo',
    label: 'Vínculo',
    decayPerSecond: -0.01,
    clamp: [0, 1],
    influences: [
      { chemical: 'oxitocina', gain: 2.0 }, // vínculo sube con oxitocina
    ],
  },
  {
    id: 'aburrimiento',
    label: 'Aburrimiento',
    decayPerSecond: 0.02,
    clamp: [0, 1],
    influences: [
      { chemical: 'dopamina', gain: -2.0 }, // aburrimiento baja con dopamina
      { chemical: 'serotonina', gain: -0.5 },
    ],
  },
  {
    id: 'miedo',
    label: 'Miedo',
    decayPerSecond: -0.03, // el miedo se disipa solo
    clamp: [0, 1],
    influences: [
      { chemical: 'cortisol', gain: 2.5 }, // miedo sube con cortisol
    ],
  },
  {
    id: 'confort',
    label: 'Confort',
    decayPerSecond: -0.01,
    clamp: [0, 1],
    influences: [
      { chemical: 'serotonina', gain: 1.5 },
      { chemical: 'oxitocina', gain: 1.0 },
      { chemical: 'cortisol', gain: -1.0 }, // el estrés resta confort
    ],
  },
];

for (const def of SEED_DRIVES) registerDrive(def);
