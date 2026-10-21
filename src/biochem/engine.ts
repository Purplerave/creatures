/**
 * BiochemEngine — motor de bioquímica determinista (Fase 0 + serialización Fase 5).
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
import type { BiochemicalImpulse, ChemicalId, DriveId, DriveState, TickResult } from '../contracts/types';
import type { IBiochem } from '../contracts/ibiochem';
import type { PhenotypeConfig } from '../contracts/igenome';
import { listDriveDefs, type DriveDef } from './driveTable';
import { listChemicalDefs, type ChemicalDef } from './chemicals';
import { CHEMICAL_REACTIONS, couplingRate, reactionTransfer } from './reactions';

/** Versión del esquema de serialización del motor bioquímico (Fase 5). */
export const BIOCHEM_SCHEMA_VERSION = 1;

/** Payload serializado de BiochemEngine con claves deterministas. */
export interface SerializedBiochemState {
  schemaVersion: number;
  drives: Record<DriveId, DriveState>;
  chemicals: Record<ChemicalId, number>;
}

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
  baseDecayPerSecond: number;
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
        def: { ...def },
        baseDecayPerSecond: def.decayPerSecond,
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
    if (options.phenotype) this.setPhenotype(options.phenotype);
    for (const id of Object.keys(options.initialChemicals ?? {})) {
      if (!this.chemicalDefs.has(id)) throw new RangeError(`Químico no registrado: ${id}`);
    }
  }

  private getDriveDefOrThrow(id: DriveId): DriveDef {
    const slot = this.driveSlots.get(id);
    if (!slot) throw new RangeError(`Drive no registrado: ${id}`);
    return slot.def;
  }

  /**
   * Reaplica de forma atómica un `PhenotypeConfig` sobre las tasas intrínsecas
   * base sin perder los niveles vivos de drives/químicos (útil al mutar o
   * cambiar metilación en caliente).
   */
  setPhenotype(phenotype?: PhenotypeConfig): void {
    const nextMultipliers = new Map<DriveId, number>();
    for (const [id, delta] of Object.entries(phenotype?.driveDecayDeltas ?? {})) {
      if (delta === undefined) continue;
      if (!Number.isFinite(delta)) {
        throw new RangeError(`Phenotype: delta no finito para drive ${id}: ${delta}`);
      }
      if (!this.driveSlots.has(id)) {
        throw new RangeError(`Phenotype: drive no registrado: ${id}`);
      }
      nextMultipliers.set(id, Math.min(4, Math.max(0, 1 + delta)));
    }
    for (const [id, slot] of this.driveSlots) {
      const multiplier = nextMultipliers.get(id) ?? 1;
      slot.def = { ...slot.def, decayPerSecond: slot.baseDecayPerSecond * multiplier };
    }
  }

  /**
   * Aplica el efecto de un evento externo sin saltarse la autoridad del motor.
   * Primero valida y calcula todo el lote; ningún estado cambia si falla un id
   * o valor. Los impulsos se suman al nivel vivo y al target del drive.
   */
  applyImpulse(impulse: BiochemicalImpulse): void {
    if (typeof impulse !== 'object' || impulse === null || Array.isArray(impulse)) {
      throw new RangeError('El impulso bioquímico debe ser un objeto');
    }
    if (
      (impulse.drives !== undefined && (typeof impulse.drives !== 'object' || impulse.drives === null || Array.isArray(impulse.drives))) ||
      (impulse.chemicals !== undefined &&
        (typeof impulse.chemicals !== 'object' || impulse.chemicals === null || Array.isArray(impulse.chemicals)))
    ) {
      throw new RangeError('Los impulsos de drives y químicos deben ser mapas');
    }

    const driveChanges: Array<{ slot: DriveSlot; level: number; target: number }> = [];
    for (const [id, delta] of Object.entries(impulse.drives ?? {})) {
      if (typeof delta !== 'number' || !Number.isFinite(delta)) {
        throw new RangeError(`Impulso no finito para drive ${id}: ${String(delta)}`);
      }
      const slot = this.driveSlots.get(id);
      if (!slot) throw new RangeError(`Drive no registrado: ${id}`);
      const [min, max] = slot.def.clamp;
      driveChanges.push({
        slot,
        level: clamp01(slot.level + delta, min, max),
        target: clamp01(slot.target + delta, min, max),
      });
    }

    const chemicalChanges: Array<{ id: ChemicalId; level: number }> = [];
    for (const [id, delta] of Object.entries(impulse.chemicals ?? {})) {
      if (typeof delta !== 'number' || !Number.isFinite(delta)) {
        throw new RangeError(`Impulso no finito para químico ${id}: ${String(delta)}`);
      }
      const current = this.chemLevels.get(id);
      if (current === undefined) throw new RangeError(`Químico no registrado: ${id}`);
      chemicalChanges.push({ id, level: clamp01(current + delta, 0, 1) });
    }

    for (const change of driveChanges) {
      change.slot.level = change.level;
      change.slot.target = change.target;
    }
    for (const change of chemicalChanges) this.chemLevels.set(change.id, change.level);
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

  /** Serializa el estado bioquímico completo a JSON estable (claves ordenadas). */
  serialize(): string {
    const drives: Record<DriveId, DriveState> = {};
    for (const id of [...this.driveSlots.keys()].sort()) {
      const slot = this.driveSlots.get(id)!;
      drives[id] = { level: slot.level, target: slot.target };
    }
    const chemicals: Record<ChemicalId, number> = {};
    for (const id of [...this.chemLevels.keys()].sort()) {
      chemicals[id] = this.chemLevels.get(id)!;
    }
    const payload: SerializedBiochemState = {
      schemaVersion: BIOCHEM_SCHEMA_VERSION,
      drives,
      chemicals,
    };
    return JSON.stringify(payload);
  }

  /**
   * Restaura un estado bioquímico de forma atómica.
   * Valida versión, tipos, finitud e ids registrados antes de mutar el motor.
   */
  deserialize(json: string): void {
    if (typeof json !== 'string') throw new RangeError('deserialize espera un string JSON');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RangeError('JSON de bioquímica inválido');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('Estado bioquímico serializado debe ser un objeto JSON');
    }
    const candidate = parsed as Partial<SerializedBiochemState>;
    if (candidate.schemaVersion !== BIOCHEM_SCHEMA_VERSION) {
      throw new RangeError(
        `schemaVersion bioquímica no soportada: ${String(candidate.schemaVersion)} (soportada: ${BIOCHEM_SCHEMA_VERSION})`,
      );
    }
    if (typeof candidate.drives !== 'object' || candidate.drives === null || Array.isArray(candidate.drives)) {
      throw new RangeError('drives serializados deben ser un mapa');
    }
    if (typeof candidate.chemicals !== 'object' || candidate.chemicals === null || Array.isArray(candidate.chemicals)) {
      throw new RangeError('chemicals serializados deben ser un mapa');
    }

    const nextDrives = new Map<DriveSlot, DriveState>();
    for (const [id, rawState] of Object.entries(candidate.drives)) {
      const slot = this.driveSlots.get(id);
      if (!slot) throw new RangeError(`Drive serializado no registrado: ${id}`);
      if (typeof rawState !== 'object' || rawState === null) {
        throw new RangeError(`Estado inválido para drive ${id}`);
      }
      if (typeof rawState.level !== 'number' || !Number.isFinite(rawState.level)) {
        throw new RangeError(`Nivel no finito para drive ${id}: ${String(rawState.level)}`);
      }
      if (typeof rawState.target !== 'number' || !Number.isFinite(rawState.target)) {
        throw new RangeError(`Target no finito para drive ${id}: ${String(rawState.target)}`);
      }
      const [min, max] = slot.def.clamp;
      nextDrives.set(slot, {
        level: clamp01(rawState.level, min, max),
        target: clamp01(rawState.target, min, max),
      });
    }

    const nextChemicals = new Map<ChemicalId, number>();
    for (const [id, rawLevel] of Object.entries(candidate.chemicals)) {
      if (!this.chemicalDefs.has(id)) throw new RangeError(`Químico serializado no registrado: ${id}`);
      if (typeof rawLevel !== 'number' || !Number.isFinite(rawLevel)) {
        throw new RangeError(`Nivel no finito para químico ${id}: ${String(rawLevel)}`);
      }
      nextChemicals.set(id, clamp01(rawLevel, 0, 1));
    }

    // Aplicación atómica: primero resetea faltantes a 0 y luego escribe validados.
    for (const slot of this.driveSlots.values()) {
      const [min, max] = slot.def.clamp;
      const incoming = nextDrives.get(slot);
      slot.level = incoming ? incoming.level : clamp01(0, min, max);
      slot.target = incoming ? incoming.target : clamp01(0, min, max);
    }
    for (const id of this.chemLevels.keys()) {
      this.chemLevels.set(id, nextChemicals.get(id) ?? 0);
    }
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
