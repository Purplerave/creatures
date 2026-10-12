/**
 * D1 — Adaptador del cerebro v0.5: `BrainV05Adapter implements IBrain`.
 *
 * Puente entre el contrato del repo (`BrainInputs`/`BrainOutput` en
 * src/contracts/ibrain.ts) y la superficie del cerebro `brain-v05`
 * (src/brain/brainv05-types.ts). Reglas:
 *
 * 1. CEREBRO ENVOLVENTE Y DESECHABLE: el adaptador solo llama `think()` y
 *    `reinforce()`; NO expone MLP, pesos, capas ni ε (ni por getters).
 * 2. ENTRADA: `BrainInputs` → vector `{drives: number[8], stimuli: number[3],
 *    genome: number[4]}` con niveles en 0..1 y orden de drives fijo.
 * 3. SALIDA: `{action, actionName, confidence, explored}` → `BrainOutput.actions`
 *    (number[] en [-1, 1]) + `debug` opcional con confidence/explored.
 * 4. `reinforce(reward)` (reward en [-1, 1]) refuerza la ÚLTIMA acción de
 *    `think()`; sin `think()` previo es un no-op (no lanza).
 * 5. EXCEPCIÓN D2 AUTORIZADA: `getDebugState()` — puerto de depuración
 *    acotado pedido por la CEO para la vista L2 (`BrainDebugState`). Expone
 *    SOLO acción/confianza/explored + arrays documentados; no filtra ε ni
 *    arquitectura del MLP. Ver `docs/ADAPTER.md` (sección Debug).
 *
 * Mapeos PROVISIONALES (ver docs/ADAPTER.md):
 * - stimuli = [dopamina, cortisol, adenosina] → recompensa/apetito, estrés,
 *   fatiga: los tres ejes químicos que más condicionan una decisión.
 * - genome = la composición de runtime inyecta `mapGenome` desde `Genome`;
 *   el adaptador directo usa [0,0,0,0] como fallback si no recibe provider.
 * - actions = [clamp(action, -1, 1)]; si `action` resulta ser índice discreto
 *   0..n-1, valorar one-hot con la CEO.
 */
import type { BrainInputs, BrainOutput, IBrain } from '../contracts/ibrain';
import type { DriveId } from '../contracts/types';
import type { BrainDebugState, BrainV05Input, BrainV05Like, BrainV05Result } from './brainv05-types';

/**
 * Orden fijo de los 8 drives en el vector de entrada (espejo del orden de
 * registro de `src/biochem/driveTable.ts`, Fase 0). Cambiar este orden rompe
 * la compatibilidad con los pesos ya entrenados ⇒ tratar como contrato.
 */
export const DRIVE_ORDER: readonly DriveId[] = [
  'hambre',
  'energia',
  'sueno',
  'curiosidad',
  'vinculo',
  'aburrimiento',
  'miedo',
  'confort',
] as const;

/**
 * Químicos de los 3 estímulos (orden fijo): [dopamina, cortisol, adenosina].
 * PROVISIONAL: dopamina = recompensa/apetito de explorar, cortisol = estrés,
 * adenosina = fatiga. Cubre los tres ejes que más pesan en una decisión.
 */
export const STIMULUS_CHEMICALS = ['dopamina', 'cortisol', 'adenosina'] as const;

/** Fallback del adaptador cuando se usa sin provider de genes. */
export const GENOME_DEFAULT: readonly number[] = [0, 0, 0, 0];

/** Proveedor de los 3 estímulos (recibe las `BrainInputs` crudas). */
export type StimuliProvider = (inputs: BrainInputs) => readonly number[];

/** Proveedor de los 4 genes (recibe las `BrainInputs` crudas). */
export type GenomeProvider = (inputs: BrainInputs) => readonly number[];

export interface BrainV05AdapterOptions {
  /** Orden de drives del vector (por defecto `DRIVE_ORDER`, 8 entradas). */
  driveOrder?: readonly DriveId[];
  /** Overrides de los 3 estímulos (por defecto `STIMULUS_CHEMICALS`). */
  mapStimuli?: StimuliProvider;
  /** Override de los 4 genes; sin provider el adapter directo usa `[0,0,0,0]`. */
  mapGenome?: GenomeProvider;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Helper de genome providers: extrae 4 genes (0..1) de cualquier objeto con
 * `getGene(id)` (p. ej. `Genome` de src/genome). Uso:
 *   `new BrainV05Adapter(brain, { mapGenome: genomeProvider(g => genome.getGene(g)) })`
 * Si faltan genes se rellenan con 0 (mismo valor que el genoma por defecto).
 */
export function genomeProvider(getGene: (id: string) => number, geneIds?: readonly string[]): GenomeProvider {
  return () => {
    const ids = geneIds ?? [];
    const out = ids.slice(0, 4).map((id) => clamp01(getGene(id)));
    while (out.length < 4) out.push(0);
    return out;
  };
}

/**
 * Adaptador IBrain ↔ brain-v05. Estado interno: SOLO la última acción (para
 * `reinforce`). El cerebro real se recibe por inyección de dependencias.
 */
export class BrainV05Adapter implements IBrain {
  private readonly brain: BrainV05Like;
  private readonly driveOrder: readonly DriveId[];
  private readonly mapStimuli: StimuliProvider;
  private readonly mapGenome: GenomeProvider;
  /** Último think() completo; null = aún no se ha llamado a think(). */
  private lastThink: { result: BrainV05Result; genome: number[] } | null = null;

  constructor(brain: BrainV05Like, options: BrainV05AdapterOptions = {}) {
    this.brain = brain;
    this.driveOrder = options.driveOrder ?? DRIVE_ORDER;
    this.mapStimuli = options.mapStimuli ?? defaultStimuli;
    this.mapGenome = options.mapGenome ?? defaultGenome;
  }

  /** `BrainInputs` → vector normalizado → `brain.think()` → `BrainOutput`. */
  think(inputs: BrainInputs): BrainOutput {
    const vector: BrainV05Input = {
      drives: this.driveOrder.map((id) => clamp01(inputs.drives[id]?.level ?? 0)),
      stimuli: padTo(this.mapStimuli(inputs), 3),
      genome: padTo(this.mapGenome(inputs), 4),
    };

    const result = this.brain.think(vector);
    this.lastThink = { result, genome: [...vector.genome] };

    return {
      actions: [clamp(result.action, -1, 1)],
      debug: {
        confidence: clamp01(result.confidence),
        explored: result.explored ? 1 : 0,
      },
    };
  }

  /**
   * Refuerza la última acción de `think()` con `reward` en [-1, 1]
   * (se recorta al rango). Sin `think()` previo: no-op, no lanza.
   */
  reinforce(reward: number): void {
    if (this.lastThink === null) return;
    this.brain.reinforce(this.lastThink.result.action, clamp(reward, -1, 1));
  }

  /**
   * Puerto de depuración D2 (excepción autorizada, ver cabecera): estado
   * para `src/render/brain-view.ts` (tarea L2 de lmarena).
   *
   * - `action`/`actionName`/`confidence`/`explored`/`genomeInputs` salen
   *   SIEMPRE del último `think()` real del adaptador (o de la forma neutra
   *   documentada si aún no ha habido ninguno; nunca lanza).
   * - `hiddenActivations`/`outputWeights` los aporta el cerebro subyacente
   *   SOLO si su debug los expone (hoy `BrainV05` real no los incluye: su
   *   `BrainV05DebugState` trae scores/probabilities/lastDecision → siguen
   *   `[]` hasta que la dueña del cerebro amplíe su debug); no se inventan.
   */
  getDebugState(): BrainDebugState {
    const last = this.lastThink;
    // Forma cruda (`RawDebugShape` = unknown): se normaliza abajo; solo se
    // leen claves documentadas y `toNumberArray` valida cada array en runtime.
    const underlying = (typeof this.brain.getDebugState === 'function'
      ? this.brain.getDebugState()
      : null) as Partial<BrainDebugState> | null;

    return {
      action: last ? last.result.action : 0,
      actionName: last ? last.result.actionName : 'sin-think',
      confidence: last ? clamp01(last.result.confidence) : 0,
      explored: last ? Boolean(last.result.explored) : false,
      hasThink: last !== null,
      hiddenActivations: toNumberArray(underlying?.hiddenActivations),
      outputWeights: toNumberArray(underlying?.outputWeights),
      genomeInputs: last ? [...last.genome] : [],
    };
  }
}

/** Estímulos por defecto: [dopamina, cortisol, adenosina] en 0..1 (faltantes → 0). */
function defaultStimuli(inputs: BrainInputs): number[] {
  return STIMULUS_CHEMICALS.map((id) => clamp01(inputs.chemicals[id] ?? 0));
}

/** Fallback del adaptador directo: [0,0,0,0]. La app usa createBrainRuntime(). */
function defaultGenome(_inputs: BrainInputs): number[] {
  return [...GENOME_DEFAULT];
}

/** Copia un array de números si lo es; cualquier otra cosa ⇒ `[]`. */
function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number')
    ? [...value]
    : [];
}

/** Copia hasta `size` valores (recorta/pilla) y los recorta a 0..1. */
function padTo(values: readonly number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(clamp01(values[i] ?? 0));
  return out;
}
