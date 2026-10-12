/**
 * Registro extensible de químicos (Fase 0: 6 químicos).
 *
 * Cada químico tiene nivel 0..1 y decaimiento exponencial por segundo
 * (primer orden): nivel(t+dt) = nivel(t) · e^(−decayPerSecond·dt).
 * Sin aleatoriedad: todo determinista.
 */
import type { ChemicalId } from '../contracts/types';

export interface ChemicalDef {
  id: ChemicalId;
  /** Etiqueta legible para UI/depuración. */
  label: string;
  /** Constante de decaimiento por segundo (≥ 0). */
  decayPerSecond: number;
}

const registry = new Map<ChemicalId, ChemicalDef>();

/** Registra un químico nuevo. Único por id; duplicado ⇒ Error. */
export function registerChemical(def: ChemicalDef): void {
  if (registry.has(def.id)) {
    throw new Error(`Químico duplicado en la tabla: ${def.id}`);
  }
  registry.set(def.id, def);
}

/** Lee una definición. Id desconocido ⇒ RangeError. */
export function getChemicalDef(id: ChemicalId): ChemicalDef {
  const def = registry.get(id);
  if (!def) throw new RangeError(`Químico no registrado: ${id}`);
  return def;
}

/** Snapshot de todas las definiciones (orden de registro). */
export function listChemicalDefs(): ChemicalDef[] {
  return [...registry.values()];
}

/** ¿Está registrado? */
export function hasChemical(id: ChemicalId): boolean {
  return registry.has(id);
}

// ---------------------------------------------------------------------------
// Los 6 químicos de Fase 0.
// ---------------------------------------------------------------------------

const SEED_CHEMICALS: ChemicalDef[] = [
  { id: 'glucosa', label: 'Glucosa', decayPerSecond: 0.05 },
  { id: 'adenosina', label: 'Adenosina', decayPerSecond: 0.08 },
  { id: 'dopamina', label: 'Dopamina', decayPerSecond: 0.15 },
  { id: 'cortisol', label: 'Cortisol', decayPerSecond: 0.12 },
  { id: 'oxitocina', label: 'Oxitocina', decayPerSecond: 0.06 },
  { id: 'serotonina', label: 'Serotonina', decayPerSecond: 0.04 },
];

for (const def of SEED_CHEMICALS) registerChemical(def);
