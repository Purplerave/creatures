/**
 * Cerebro v0.5 REAL — MLP con ε-greedy y aprendizaje Hebbiano por refuerzo.
 *
 * Sustituye a `PlaceholderBrain` en la fábrica de `createBrainRuntime()`.
 * Cumple la superficie estructural `BrainV05Like` (think/reinforce/serialize/
 * deserialize/dispose) + `getDebugState()` para la UI y los tests. El adaptador
 * (`src/brain/adapter.ts`) NO se modifica: sigue siendo la única pieza que toca
 * al cerebro y el resto del proyecto no ve pesos ni capas.
 *
 * RED
 *   entrada (15) → oculta tanh (hiddenSize) → puntuaciones lineales (N acciones)
 *   entrada = drives[8] ++ stimuli[3] ++ genome[4]  (orden del contrato v0.5)
 *
 * DECISIÓN
 *   greedy = argmax de las puntuaciones (empate ⇒ índice menor, determinista)
 *   con probabilidad ε se explora: acción uniforme aleatoria (PRNG con semilla)
 *   ε decae por decisión: ε ← max(εSuelo, ε · εDecay)   (suelo 5 % por defecto)
 *   confidence = probabilidad softmax de la acción elegida
 *   action = CÓDIGO escalar en [-1, 1] de la acción (ver src/brain/actions.ts)
 *
 * APRENDIZAJE (Hebbiano modulado por recompensa, reward ∈ [-1, 1])
 *   Se guarda la traza de la última pasada (entrada x, oculta h). Con
 *   `reinforce(actionCode, r)` y η = learningRate, para la acción a elegida:
 *
 *     Δw2[a][j] = η · r · h[j]                       (pre × post, capa salida)
 *     Δb2[a]    = η · r
 *     Δw1[j][i] = η · r · (w2[a][j] · (1 − h[j]²)) · x[i]   (Hebb encadenado)
 *     Δb1[j]    = η · r · (w2[a][j] · (1 − h[j]²))
 *
 *   Es decir: «las sinapsis que dispararon la acción se refuerzan si la
 *   recompensa es positiva y se debilitan si es negativa» — un paso de gradiente
 *   de política sobre el logit de la acción, que es la forma moderna del
 *   refuerzo por químicos 204/205 del original. Pesos recortados a ±maxWeight.
 *
 * DETERMINISMO
 *   Cero `Math.random()`, cero I/O, cero tiempo real: la inicialización de pesos
 *   y la exploración ε salen de `mulberry32(seed)` (el PRNG del genoma). Misma
 *   semilla + mismas entradas + mismos refuerzos ⇒ mismas decisiones bit a bit.
 *   El estado del PRNG se reproduce serializando el nº de extracciones.
 */
import type { BrainV05Input, BrainV05Like, BrainV05Result } from './brainv05-types';
import type { BrainKnobConfig } from '../contracts/igenome';
import { mulberry32, normalizeSeed } from '../genome/prng';
import {
  DEFAULT_ACTIONS,
  actionFromValue,
  validateActions,
  type BrainAction,
} from './actions';

/** Versión del esquema de serialización (romper compat ⇒ subir este número). */
export const BRAIN_V05_SCHEMA_VERSION = 1;

/** Composición del vector de entrada del contrato v0.5. */
export const INPUT_LAYOUT = { drives: 8, stimuli: 3, genome: 4 } as const;

/** Tamaño total del vector de entrada (8 + 3 + 4). */
export const INPUT_SIZE = INPUT_LAYOUT.drives + INPUT_LAYOUT.stimuli + INPUT_LAYOUT.genome;

/** Semilla por defecto: la red y la exploración son reproducibles. */
export const DEFAULT_BRAIN_SEED = 20261012;

/** Valores por defecto de los parámetros no cubiertos por los knobs del genoma. */
export const DEFAULT_HIDDEN_SIZE = 12;
export const DEFAULT_LEARNING_RATE = 0.08;
export const DEFAULT_EPSILON_INITIAL = 0.35;
/** Suelo de exploración acordado en el brief del cerebro v0.5: 5 %. */
export const DEFAULT_EPSILON_FLOOR = 0.05;
/** Decaimiento de ε por decisión (0.9995 ⇒ ~62 s si `think()` corre a 60 Hz). */
export const DEFAULT_EPSILON_DECAY = 0.9995;
/** Recorte de pesos/bias: evita saturación y mantiene la red estable. */
export const DEFAULT_MAX_WEIGHT = 4;

/** Opciones de construcción (los knobs del genoma tienen prioridad). */
export interface BrainV05Options extends BrainKnobConfig {
  /** ε mínimo tras el decaimiento (0..1); se sanea a ≤ epsilonInitial. */
  epsilonFloor?: number;
  /** Factor multiplicativo de ε por decisión (0 < d ≤ 1; 1 = ε constante). */
  epsilonDecay?: number;
  /** Semilla uint32 del PRNG de pesos y exploración. */
  seed?: number;
  /** Recorte simétrico de pesos y bias (> 0). */
  maxWeight?: number;
  /** Espacio de acciones (por defecto `DEFAULT_ACTIONS`, 5 verbos). */
  actions?: readonly BrainAction[];
}

/** Configuración ya resuelta y validada (todo presente, nada undefined). */
export interface ResolvedBrainV05Config {
  hiddenSize: number;
  learningRate: number;
  epsilonInitial: number;
  epsilonFloor: number;
  epsilonDecay: number;
  seed: number;
  maxWeight: number;
}

/** Última decisión, para depuración/UI. */
export interface BrainV05LastDecision {
  index: number;
  id: string;
  name: string;
  value: number;
  explored: boolean;
  confidence: number;
}

/** Estado observable del cerebro (copia: no permite mutar internals). */
export interface BrainV05DebugState {
  config: ResolvedBrainV05Config;
  inputSize: number;
  actions: BrainAction[];
  /** Decisiones tomadas (think) y refuerzos aplicados. */
  thinks: number;
  reinforces: number;
  /** ε actual (tras el decaimiento de la última decisión). */
  epsilon: number;
  /** Puntuaciones y probabilidades softmax de la última pasada. */
  scores: number[];
  probabilities: number[];
  lastDecision: BrainV05LastDecision | null;
  /** Último refuerzo aplicado y suma acumulada (signo del historial). */
  lastReward: number;
  rewardTotal: number;
  /** Norma L2 y valor absoluto máximo de los pesos (salud de la red). */
  weightNorm: number;
  weightAbsMax: number;
  /** Copia defensiva de activaciones ocultas `tanh` tras `think()` (`[]` antes del primero). */
  hiddenActivations: number[];
  /** Copia defensiva plana de pesos `hiddenAction` tras `think()` (`[]` antes del primero). */
  outputWeights: number[];
  /** Extracciones del PRNG consumidas (estado reproducible del azar). */
  draws: number;
}

/** Payload serializado (claves en orden estable). */
interface SerializedBrainV05 {
  schemaVersion: number;
  config: ResolvedBrainV05Config;
  actions: BrainAction[];
  state: { epsilon: number; thinks: number; reinforces: number; draws: number; lastReward: number; rewardTotal: number };
  weights: { inputHidden: number[]; hiddenBias: number[]; hiddenAction: number[]; actionBias: number[] };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return clamp(value, 0, 1);
}

function requireFinite(label: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} no finito: ${String(value)}`);
  return value;
}

/** Resuelve y valida la configuración (knobs del genoma + opciones). */
export function resolveBrainV05Config(options: BrainV05Options = {}): ResolvedBrainV05Config {
  const hiddenRaw = options.hiddenSize ?? DEFAULT_HIDDEN_SIZE;
  requireFinite('hiddenSize', hiddenRaw);
  const hiddenSize = Math.round(hiddenRaw);
  if (hiddenSize < 1 || hiddenSize > 256) {
    throw new RangeError(`hiddenSize fuera de rango: ${hiddenRaw} (entero entre 1 y 256)`);
  }

  const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE;
  requireFinite('learningRate', learningRate);
  if (learningRate <= 0 || learningRate > 1) {
    throw new RangeError(`learningRate fuera de rango: ${learningRate} (debe estar en (0, 1])`);
  }

  const epsilonInitial = clamp01(options.epsilonInitial ?? DEFAULT_EPSILON_INITIAL);
  const epsilonFloorRaw = clamp01(options.epsilonFloor ?? DEFAULT_EPSILON_FLOOR);
  // Saneado: el suelo nunca puede quedar por encima del ε inicial.
  const epsilonFloor = Math.min(epsilonFloorRaw, epsilonInitial);

  const epsilonDecay = options.epsilonDecay ?? DEFAULT_EPSILON_DECAY;
  requireFinite('epsilonDecay', epsilonDecay);
  if (epsilonDecay <= 0 || epsilonDecay > 1) {
    throw new RangeError(`epsilonDecay fuera de rango: ${epsilonDecay} (debe estar en (0, 1])`);
  }

  const maxWeight = options.maxWeight ?? DEFAULT_MAX_WEIGHT;
  requireFinite('maxWeight', maxWeight);
  if (maxWeight <= 0) throw new RangeError(`maxWeight debe ser > 0: ${maxWeight}`);

  const seed = normalizeSeed(options.seed ?? DEFAULT_BRAIN_SEED);

  return { hiddenSize, learningRate, epsilonInitial, epsilonFloor, epsilonDecay, seed, maxWeight };
}

/**
 * Cerebro v0.5: MLP 15 → hiddenSize → N acciones con ε-greedy y Hebbiano por
 * refuerzo. Encapsulado: quien lo construye (main.ts) lo pasa al adaptador y
 * el resto del proyecto solo ve `IBrain`.
 */
export class BrainV05 implements BrainV05Like {
  private readonly config: ResolvedBrainV05Config;
  private readonly actions: readonly BrainAction[];
  private readonly inputSize = INPUT_SIZE;

  /** Pesos entrada→oculta (hiddenSize × inputSize, fila mayor). */
  private readonly inputHidden: Float64Array;
  private readonly hiddenBias: Float64Array;
  /** Pesos oculta→acciones (nActions × hiddenSize, fila mayor). */
  private readonly hiddenAction: Float64Array;
  private readonly actionBias: Float64Array;

  /**Buffers de la última pasada (traza de elegibilidad Hebbiana). */
  private readonly hidden: Float64Array;
  private readonly scores: Float64Array;
  private readonly probabilities: Float64Array;
  private lastInput: Float64Array | null = null;

  private rng: () => number;
  private draws = 0;
  private epsilon: number;
  private thinks = 0;
  private reinforces = 0;
  private lastReward = 0;
  private rewardTotal = 0;
  private lastDecision: BrainV05LastDecision | null = null;
  private disposed = false;

  constructor(options: BrainV05Options = {}) {
    this.config = resolveBrainV05Config(options);
    this.actions = validateActions(options.actions ?? DEFAULT_ACTIONS);
    const { hiddenSize, seed } = this.config;
    const actionCount = this.actions.length;

    this.inputHidden = new Float64Array(hiddenSize * this.inputSize);
    this.hiddenBias = new Float64Array(hiddenSize);
    this.hiddenAction = new Float64Array(actionCount * hiddenSize);
    this.actionBias = new Float64Array(actionCount);
    this.hidden = new Float64Array(hiddenSize);
    this.scores = new Float64Array(actionCount);
    this.probabilities = new Float64Array(actionCount);

    this.epsilon = this.config.epsilonInitial;
    this.rng = mulberry32(seed);
    this.initWeights();
  }

  /** Inicialización uniforme escalada (Xavier-ish), determinista con la semilla. */
  private initWeights(): void {
    const { hiddenSize, maxWeight } = this.config;
    const scaleIn = 1 / Math.sqrt(this.inputSize);
    const scaleOut = 1 / Math.sqrt(hiddenSize);
    for (let k = 0; k < this.inputHidden.length; k++) {
      this.inputHidden[k] = clamp((this.nextRandom() * 2 - 1) * scaleIn, -maxWeight, maxWeight);
    }
    for (let k = 0; k < this.hiddenAction.length; k++) {
      this.hiddenAction[k] = clamp((this.nextRandom() * 2 - 1) * scaleOut, -maxWeight, maxWeight);
    }
    // Bias a 0: ninguna acción nace favorecida (el aprendizaje decide).
    this.hiddenBias.fill(0);
    this.actionBias.fill(0);
  }

  /** Extracción del PRNG con contador (permite reproducir el azar al cargar). */
  private nextRandom(): number {
    this.draws += 1;
    return this.rng();
  }

  /** Espacio de acciones efectivo (copia). */
  getActions(): BrainAction[] {
    return this.actions.map((action) => ({ ...action }));
  }

  /** Configuración resuelta (copia). */
  getConfig(): ResolvedBrainV05Config {
    return { ...this.config };
  }

  /**
   * Una pasada de decisión: normaliza el vector, propaga, elige con ε-greedy,
   * decae ε y guarda la traza para el refuerzo.
   * @throws RangeError si la entrada no es un objeto con vectores numéricos.
   */
  think(input: BrainV05Input): BrainV05Result {
    this.assertAlive();
    const x = this.buildInput(input);
    const { hiddenSize } = this.config;
    const actionCount = this.actions.length;

    // Capa oculta (tanh).
    for (let j = 0; j < hiddenSize; j++) {
      let sum = this.hiddenBias[j];
      const base = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) sum += this.inputHidden[base + i] * x[i];
      this.hidden[j] = Math.tanh(sum);
    }

    // Puntuaciones de acción + softmax (estable: resta el máximo).
    let maxScore = -Infinity;
    for (let a = 0; a < actionCount; a++) {
      let sum = this.actionBias[a];
      const base = a * hiddenSize;
      for (let j = 0; j < hiddenSize; j++) sum += this.hiddenAction[base + j] * this.hidden[j];
      this.scores[a] = sum;
      if (sum > maxScore) maxScore = sum;
    }
    let total = 0;
    for (let a = 0; a < actionCount; a++) {
      const exp = Math.exp(this.scores[a] - maxScore);
      this.probabilities[a] = exp;
      total += exp;
    }
    for (let a = 0; a < actionCount; a++) this.probabilities[a] = total > 0 ? this.probabilities[a] / total : 1 / actionCount;

    // ε-greedy: argmax (empate ⇒ índice menor) o exploración uniforme.
    let greedy = 0;
    for (let a = 1; a < actionCount; a++) if (this.scores[a] > this.scores[greedy]) greedy = a;
    const epsilonAtDecision = this.epsilon;
    const explored = this.nextRandom() < epsilonAtDecision;
    const chosen = explored
      ? Math.min(actionCount - 1, Math.floor(this.nextRandom() * actionCount))
      : greedy;

    // ε decae por decisión, con suelo.
    this.epsilon = Math.max(this.config.epsilonFloor, epsilonAtDecision * this.config.epsilonDecay);

    // Traza de elegibilidad para el próximo reinforce().
    this.lastInput = x;
    this.thinks += 1;
    const action = this.actions[chosen];
    if (!action) throw new RangeError(`Índice de acción fuera de rango: ${chosen}`);
    this.lastDecision = {
      index: chosen,
      id: action.id,
      name: action.name,
      value: action.value,
      explored,
      confidence: this.probabilities[chosen],
    };

    return {
      action: action.value,
      actionName: action.name,
      confidence: this.probabilities[chosen],
      explored,
    };
  }

  /**
   * Refuerzo Hebbiano de la acción `actionCode` sobre la última pasada.
   * `reward` se recorta a [-1, 1]. Sin `think()` previo es un no-op (no lanza),
   * igual que el adaptador.
   * @throws RangeError si la recompensa no es finita o el código es desconocido.
   */
  reinforce(actionCode: number, reward: number): void {
    this.assertAlive();
    if (this.lastInput === null || this.lastDecision === null) return;
    requireFinite('reward', reward);
    const found = actionFromValue(this.actions, actionCode);
    if (!found) {
      throw new RangeError(`Código de acción desconocido: ${String(actionCode)} (ver src/brain/actions.ts)`);
    }
    const { index: actionIndex } = found;
    const { hiddenSize, learningRate, maxWeight } = this.config;
    const x = this.lastInput;
    const r = clamp(reward, -1, 1);
    const step = learningRate * r;

    // Gradiente Hebbiano encadenado hacia la capa oculta (con w2 ANTES de actualizar).
    const hiddenSignal = new Float64Array(hiddenSize);
    const actionBase = actionIndex * hiddenSize;
    for (let j = 0; j < hiddenSize; j++) {
      const h = this.hidden[j];
      hiddenSignal[j] = this.hiddenAction[actionBase + j] * (1 - h * h);
    }

    // Capa de salida: pre (h) × post (recompensa de la acción elegida).
    for (let j = 0; j < hiddenSize; j++) {
      this.hiddenAction[actionBase + j] = clamp(
        this.hiddenAction[actionBase + j] + step * this.hidden[j],
        -maxWeight,
        maxWeight,
      );
    }
    this.actionBias[actionIndex] = clamp(this.actionBias[actionIndex] + step, -maxWeight, maxWeight);

    // Capa oculta: misma señal propagada hacia las entradas que la causaron.
    for (let j = 0; j < hiddenSize; j++) {
      const signal = step * hiddenSignal[j];
      if (signal === 0) continue;
      const base = j * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        this.inputHidden[base + i] = clamp(this.inputHidden[base + i] + signal * x[i], -maxWeight, maxWeight);
      }
      this.hiddenBias[j] = clamp(this.hiddenBias[j] + signal, -maxWeight, maxWeight);
    }

    this.reinforces += 1;
    this.lastReward = r;
    this.rewardTotal += r;
  }

  /** Estado observable (copias: la UI/tests no pueden mutar la red). */
  getDebugState(): BrainV05DebugState {
    let weightNorm = 0;
    let weightAbsMax = 0;
    for (const array of [this.inputHidden, this.hiddenAction]) {
      for (let k = 0; k < array.length; k++) {
        const value = array[k];
        weightNorm += value * value;
        const abs = Math.abs(value);
        if (abs > weightAbsMax) weightAbsMax = abs;
      }
    }
    return {
      config: { ...this.config },
      inputSize: this.inputSize,
      actions: this.getActions(),
      thinks: this.thinks,
      reinforces: this.reinforces,
      epsilon: this.epsilon,
      scores: Array.from(this.scores),
      probabilities: Array.from(this.probabilities),
      lastDecision: this.lastDecision ? { ...this.lastDecision } : null,
      lastReward: this.lastReward,
      rewardTotal: this.rewardTotal,
      weightNorm: Math.sqrt(weightNorm),
      weightAbsMax,
      hiddenActivations: this.thinks > 0 && !this.disposed ? Array.from(this.hidden) : [],
      outputWeights: this.thinks > 0 && !this.disposed ? Array.from(this.hiddenAction) : [],
      draws: this.draws,
    };
  }

  /** Serialización estable y determinista (mismo estado ⇒ mismo string). */
  serialize(): string {
    const payload: SerializedBrainV05 = {
      schemaVersion: BRAIN_V05_SCHEMA_VERSION,
      config: { ...this.config },
      actions: this.getActions(),
      state: {
        epsilon: this.epsilon,
        thinks: this.thinks,
        reinforces: this.reinforces,
        draws: this.draws,
        lastReward: this.lastReward,
        rewardTotal: this.rewardTotal,
      },
      weights: {
        inputHidden: Array.from(this.inputHidden),
        hiddenBias: Array.from(this.hiddenBias),
        hiddenAction: Array.from(this.hiddenAction),
        actionBias: Array.from(this.actionBias),
      },
    };
    return JSON.stringify(payload);
  }

  /**
   * Restaura un estado serializado EN ESTA instancia (config, acciones, pesos,
   * ε, contadores y posición del PRNG). Tras cargar, las decisiones siguientes
   * son idénticas a las del cerebro original.
   * @throws RangeError si el JSON es inválido, la versión no casa o las formas
   *   de los arrays no corresponden a la configuración serializada.
   */
  deserialize(json: string): void {
    this.assertAlive();
    if (typeof json !== 'string') throw new RangeError('deserialize espera un string JSON');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RangeError('JSON de cerebro inválido');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('Cerebro serializado debe ser un objeto JSON');
    }
    const candidate = parsed as Partial<SerializedBrainV05>;
    if (candidate.schemaVersion !== BRAIN_V05_SCHEMA_VERSION) {
      throw new RangeError(
        `schemaVersion no soportada: ${String(candidate.schemaVersion)} (soportada: ${BRAIN_V05_SCHEMA_VERSION})`,
      );
    }
    const config = resolveBrainV05Config(candidate.config ?? {});
    const actions = validateActions(candidate.actions ?? DEFAULT_ACTIONS);
    if (actions.length !== this.actions.length) {
      throw new RangeError(
        `Espacio de acciones incompatible: ${actions.length} serializadas vs ${this.actions.length} de esta instancia`,
      );
    }
    if (config.hiddenSize !== this.config.hiddenSize) {
      throw new RangeError(
        `hiddenSize incompatible: ${config.hiddenSize} serializado vs ${this.config.hiddenSize} de esta instancia ` +
          '(construye el cerebro con los mismos knobs para cargar un estado)',
      );
    }

    const state = candidate.state;
    if (typeof state !== 'object' || state === null) throw new RangeError('state serializado inválido');
    const epsilon = clamp01(state.epsilon);
    for (const [label, value] of [
      ['thinks', state.thinks],
      ['reinforces', state.reinforces],
      ['draws', state.draws],
    ] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new RangeError(`Contador ${label} inválido: ${String(value)}`);
      }
    }
    const lastReward = typeof state.lastReward === 'number' && Number.isFinite(state.lastReward) ? clamp(state.lastReward, -1, 1) : 0;
    const rewardTotal = typeof state.rewardTotal === 'number' && Number.isFinite(state.rewardTotal) ? state.rewardTotal : 0;

    const weights = candidate.weights;
    if (typeof weights !== 'object' || weights === null) throw new RangeError('weights serializado inválido');
    this.loadMatrix('inputHidden', weights.inputHidden, this.inputHidden, config.maxWeight);
    this.loadMatrix('hiddenBias', weights.hiddenBias, this.hiddenBias, config.maxWeight);
    this.loadMatrix('hiddenAction', weights.hiddenAction, this.hiddenAction, config.maxWeight);
    this.loadMatrix('actionBias', weights.actionBias, this.actionBias, config.maxWeight);

    // El azar se reproduce avanzando el PRNG el mismo nº de extracciones.
    this.rng = mulberry32(config.seed);
    for (let i = 0; i < state.draws; i++) this.rng();
    this.draws = state.draws;

    this.epsilon = Math.max(config.epsilonFloor, Math.min(epsilon, config.epsilonInitial));
    this.thinks = state.thinks;
    this.reinforces = state.reinforces;
    this.lastReward = lastReward;
    this.rewardTotal = rewardTotal;
    this.lastInput = null;
    this.lastDecision = null;
    this.scores.fill(0);
    this.probabilities.fill(0);
    Object.assign(this.config, config);
  }

  /** Libera la red. Tras `dispose()`, `think`/`reinforce` lanzan `Error`. */
  dispose(): void {
    this.disposed = true;
    this.lastInput = null;
    this.lastDecision = null;
    this.inputHidden.fill(0);
    this.hiddenBias.fill(0);
    this.hiddenAction.fill(0);
    this.actionBias.fill(0);
    this.hidden.fill(0);
    this.scores.fill(0);
    this.probabilities.fill(0);
  }

  /** ¿Ya desechado? (útil para tests y para el bucle de la app). */
  isDisposed(): boolean {
    return this.disposed;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private assertAlive(): void {
    if (this.disposed) throw new Error('Cerebro desechado (dispose): construye una instancia nueva');
  }

  private loadMatrix(label: string, raw: unknown, target: Float64Array, maxWeight: number): void {
    if (!Array.isArray(raw)) throw new RangeError(`weights.${label} debe ser un array`);
    if (raw.length !== target.length) {
      throw new RangeError(`weights.${label} con longitud ${raw.length}; se esperaban ${target.length}`);
    }
    for (let k = 0; k < raw.length; k++) {
      const value = raw[k];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new RangeError(`weights.${label}[${k}] no es un número finito: ${String(value)}`);
      }
      target[k] = clamp(value, -maxWeight, maxWeight);
    }
  }

  /** `BrainV05Input` → vector plano de 15 valores 0..1 (rellena/recorta). */
  private buildInput(input: BrainV05Input): Float64Array {
    if (typeof input !== 'object' || input === null) {
      throw new RangeError('think espera un BrainV05Input { drives, stimuli, genome }');
    }
    const x = new Float64Array(this.inputSize);
    let offset = 0;
    for (const [key, size] of [
      ['drives', INPUT_LAYOUT.drives],
      ['stimuli', INPUT_LAYOUT.stimuli],
      ['genome', INPUT_LAYOUT.genome],
    ] as const) {
      const values = input[key];
      if (values !== undefined && !Array.isArray(values)) {
        throw new RangeError(`think: «${key}» debe ser un array de números`);
      }
      for (let i = 0; i < size; i++) {
        const value = Array.isArray(values) ? values[i] : undefined;
        x[offset + i] = typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : 0;
      }
      offset += size;
    }
    return x;
  }
}
