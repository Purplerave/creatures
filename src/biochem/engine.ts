/**
 * BiochemEngine — motor de bioquímica determinista (Fase 0).
 *
 * Implementa IBiochem. Un tick hace, en orden:
 *  1. Reacciones químicas A→B (integración exponencial de primer orden).
 *  2. Decaimiento exponencial de cada químico (nivel · e^(−decay·dt)).
 *  3. Drives: nivel += (deriva intrínseca + Σ acoplamientos) · dt, luego clamp
 *     0..1 (o el clamp del drive). `target` = nivel + deriva (proyección a 1 s).
 *
 * Puro y determinista: sin aleatoriedad, sin I/O, sin tiempo real. Mismas
 * condiciones iniciales + mismo dt ⇒ mismo resultado bit a bit.
 *
 * Extensibilidad: lee los registros de driveTable.ts y chemicals.ts al
 * construirse (snapshot). Regístralos ANTES de instanciar el motor.
 */
import type { ChemicalId, DriveId, DriveState, TickResult } from '../contracts/types';
import type { IBiochem } from '../contracts/ibiochem';
import type { PhenotypeConfig } from '../contracts/igenome';
import { listDriveDefs, type DriveDef } from './driveTable';
import { listChemicalDefs, type ChemicalDef } from './chemicals';
import { CHEMICAL_REACTIONS, couplingRate, reactionTransfer } from './reactions';

export interface BiochemEngineOptions {
  /** Niveles iniciales de químicos (0..1); el resto arranca en 0. */
  initialChemicals?: Partial<Record<ChemicalId, number>>;
  /** Niveles iniciales de drives; el resto arranca en 0. */
  initialDrives?: Partial<Record<DriveId, number>>;
  /**
   * Capa de configuración del genoma (Fase genoma): deltas relativos sobre
   * `decayPerSecond` por drive (ver src/contracts/igenome.ts). El motor solo
   * usa `driveDecayDeltas`; la sección `brain` la consume quien construya el
   * cerebro. SIN phenotype (o con deltas a 0) el comportamiento es idéntico
   * al de Fase 0 — no cambia driveTable.ts, solo este snapshot en construcción.
   */
  phenotype?: PhenotypeConfig;
}

interface DriveSlot {
  def: DriveDef;
  level: number;
  target: number;
}

function clamp01(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export class BiochemEngine implements IBiochem {
  private readonly driveSlots: Map<DriveId, DriveSlot> = new Map();
  private readonly chemicalDefs: Map<ChemicalId, ChemicalDef> = new Map();
  private readonly chemLevels: Map<ChemicalId, number> = new Map();

  constructor(options: BiochemEngineOptions = {}) {
    // Snapshot de los registros (los drives se apuntan al construir).
    for (const def of listDriveDefs()) {
      const initial = options.initialDrives?.[def.id] ?? 0;
      this.driveSlots.set(def.id, {
        def,
        level: clamp01(initial, def.clamp[0], def.clamp[1]),
        target: clamp01(initial, def.clamp[0], def.clamp[1]),
      });
    }
    for (const def of listChemicalDefs()) {
      const initial = options.initialChemicals?.[def.id] ?? 0;
      if (initial < 0 || initial > 1 || Number.isNaN(initial)) {
        throw new RangeError(`Nivel inicial fuera de 0..1 para ${def.id}: ${initial}`);
      }
      this.chemicalDefs.set(def.id, def);
      this.chemLevels.set(def.id, initial);
    }
    // Validar que las opciones referencian entidades registradas.
    for (const id of Object.keys(options.initialDrives ?? {})) this.getDriveDefOrThrow(id);
    // Capa phenotype: deltas relativos de decayPerSecond por drive.
    // decayEfectivo = decayPerSecond · clamp(1 + delta, 0, 4). Delta 0 ⇒ idéntico.
    if (options.phenotype) {
      for (const [id, delta] of Object.entries(options.phenotype.driveDecayDeltas ?? {})) {
        if (delta === undefined) continue;
        if (!Number.isFinite(delta)) {
          throw new RangeError(`Phenotype: delta no finito para drive ${id}: ${delta}`);
        }
        const slot = this.driveSlots.get(id);
        if (!slot) throw new RangeError(`Phenotype: drive no registrado: ${id}`);
        const multiplier = Math.min(4, Math.max(0, 1 + delta));
        // Snapshot del def con el decay ajustado (driveTable queda intacto).
        slot.def = { ...slot.def, decayPerSecond: slot.def.decayPerSecond * multiplier };
      }
    }
    for (const id of Object.keys(options.initialChemicals ?? {})) {
      if (!this.chemicalDefs.has(id)) throw new RangeError(`Químico no registrado: ${id}`);
    }
  }

  private getDriveDefOrThrow(id: DriveId): DriveDef {
    const slot = this.driveSlots.get(id);
    if (!slot) throw new RangeError(`Drive no registrado: ${id}`);
    return slot.def;
  }

  tick(dtSeconds: number): TickResult {
    if (dtSeconds < 0) throw new RangeError(`dt negativo no soportado: ${dtSeconds}`);
    const dt = dtSeconds;

    // 1) Reacciones químicas A→B (primero reactivos, luego decaimiento).
    for (const rx of CHEMICAL_REACTIONS) {
      const from = this.chemLevels.get(rx.from);
      const to = this.chemLevels.get(rx.to);
      if (from === undefined || to === undefined) {
        throw new RangeError(`Reacción con químico no registrado: ${rx.from}→${rx.to}`);
      }
      const amount = reactionTransfer(from, rx.k, dt);
      if (amount > 0) {
        this.chemLevels.set(rx.from, from - amount);
        this.chemLevels.set(rx.to, Math.min(1, to + amount));
      }
    }

    // 2) Decaimiento exponencial de cada químico.
    for (const [id, def] of this.chemicalDefs) {
      const level = this.chemLevels.get(id) ?? 0;
      const next = level > 0 ? level * Math.exp(-def.decayPerSecond * dt) : 0;
      this.chemLevels.set(id, clamp01(next, 0, 1));
    }

    // 3) Drives: integración lineal + clamp, y proyección target a 1 s.
    const chemicalsSnapshot: Record<ChemicalId, number> = {};
    for (const [id, level] of this.chemLevels) chemicalsSnapshot[id] = level;

    for (const slot of this.driveSlots.values()) {
      const rate = couplingRate(slot.def, chemicalsSnapshot);
      const [min, max] = slot.def.clamp;
      slot.level = clamp01(slot.level + rate * dt, min, max);
      slot.target = clamp01(slot.level + rate, min, max);
    }

    return this.snapshot(dt);
  }

  getDrive(id: DriveId): DriveState {
    const slot = this.driveSlots.get(id);
    if (!slot) throw new RangeError(`Drive no registrado: ${id}`);
    return { level: slot.level, target: slot.target };
  }

  getChemical(id: ChemicalId): number {
    const level = this.chemLevels.get(id);
    if (level === undefined) throw new RangeError(`Químico no registrado: ${id}`);
    return level;
  }

  /** Extra-contractual: ids de drives registrados (para UI/render). */
  listDrives(): DriveId[] {
    return [...this.driveSlots.keys()];
  }

  /** Extra-contractual: ids de químicos registrados (para UI/render). */
  listChemicals(): ChemicalId[] {
    return [...this.chemLevels.keys()];
  }

  private snapshot(dt: number): TickResult {
    const drives: Record<DriveId, DriveState> = {};
    for (const [id, slot] of this.driveSlots) {
      drives[id] = { level: slot.level, target: slot.target };
    }
    const chemicals: Record<ChemicalId, number> = {};
    for (const [id, level] of this.chemLevels) chemicals[id] = level;
    return { dt, drives, chemicals };
  }
}
