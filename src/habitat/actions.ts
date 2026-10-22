/**
 * Acciones guiadas del hábitat — lógica compartida **DOM-free** entre el
 * laboratorio (`src/main.ts`) y el servidor público (`src/server/index.ts`).
 *
 * Nace de los commits `ac3d736` / `773ff23` («acciones guiadas»), donde la
 * lógica gesto → estímulo vivía inline en `main.ts`: aquí se extrae para que
 * las dos caras del mismo motor ejecuten exactamente el mismo camino
 * (impulso bioquímico + aprendizaje guiado) sin duplicar ni romper nada.
 *
 * Reglas que respeta (idénticas a las de `main.ts`):
 *  1. El mundo devuelve el impulso; **el motor conserva la autoridad**: solo
 *     `engine.applyImpulse()` toca drives/químicos.
 *  2. Un ejemplo guiado solo enseña si su efecto bioquímico produjo un cambio
 *     medible (`|reward| ≥ 0.01` en `driveReductionReward`).
 *  3. «Suman, no ordenan»: la acción guiada no sustituye las decisiones del
 *     cerebro; solo refuerza la categoría elegida por quien gestioneá.
 *  4. Sin aleatoriedad propia: toda la decisión estocástica vive en el cerebro
 *     (PRNG con semilla). Cero `Math.random()` en todo el módulo.
 */
import type { BrainInputs, BrainOutput } from '../contracts/ibrain';
import type { TickResult } from '../contracts/types';
import type { BiochemEngine } from '../biochem';
import type { BrainV05Adapter } from '../brain';
import type { BrainV05 } from '../brain/brain-v05';
import type { Vocabulary } from '../vocab';
import type { BrainAction } from '../brain/actions';
import {
  CreatureWorld,
  WORLD_ACTION_LABELS,
  type WorldActionId,
  type WorldActionResult,
  type WorldObjectId,
} from '../world';
import { driveDiscomfort, driveReductionReward } from '../brain/reward';

/** Quién originó la acción: `manual` = gesto/guiado, `brain` = decisión propia. */
export type ActionSource = 'manual' | 'brain';

/** Mapa objeto del mundo → estímulo del vocabulario (heredado de `main.ts`). */
export const OBJECT_STIMULUS_MAP: Partial<Record<WorldObjectId, string>> = {
  comedero: 'comida',
  pelota: 'objeto:pelota',
  'luz-suave': 'luz:suave',
  nido: 'nido',
  xilofono: 'objeto:xilofono',
};

/**
 * Estímulos que la cara pública del servidor consulta/recuerda.
 * `nido` y `objeto:xilofono` son nuevos respecto a la UI del laboratorio
 * (los gestos públicos descansar/enseñar encajan con esos objetos).
 */
export const PUBLIC_STIMULUS_IDS: readonly string[] = [
  'comida',
  'objeto:pelota',
  'luz:suave',
  'nido',
  'objeto:xilofono',
];

/** Los 4 gestos públicos y su traducción a acción del mundo + estímulo. */
export type GestureKind = 'feed' | 'play' | 'teach' | 'rest';

/** Acción del mundo que materializa cada gesto (en el próximo tick). */
export const GESTURE_ACTION: Record<GestureKind, WorldActionId> = {
  feed: 'buscar',
  play: 'explorar',
  teach: 'tocar',
  rest: 'descansar',
};

/** Estímulo con el que se asocia la palabra de un gesto `teach`. */
export const GESTURE_STIMULUS: Record<GestureKind, string> = {
  feed: 'comida',
  play: 'objeto:pelota',
  teach: 'objeto:xilofono',
  rest: 'nido',
};

/** Etiqueta legible de una acción del mundo (para textos de la casa). */
export function worldActionLabel(actionId: string): string {
  return WORLD_ACTION_LABELS[actionId as WorldActionId] ?? actionId;
}

/** Construye las entradas del cerebro (misma forma que en `main.ts`). */
export function brainInputs(snapshot: TickResult, tick: number): BrainInputs {
  return { drives: snapshot.drives, chemicals: snapshot.chemicals, tick };
}

/**
 * Convierte acciones concretas del hábitat en los cinco hábitos que sí modela
 * el cerebro. `null` = esa acción no enseña ninguna categoría.
 * (Heredado tal cual de `main.ts` / commit `773ff23`.)
 */
export function learningCategory(actionId: string): string | null {
  if (actionId === 'descansar') return 'descansar';
  if (actionId === 'acurrucarse' || actionId === 'abrazar') return 'acurrucarse';
  if (actionId === 'observar' || actionId === 'mirar') return 'observar';
  if (actionId === 'explorar' || actionId === 'atravesar' || actionId === 'tocar') return 'explorar';
  if (actionId === 'buscar') return 'buscar';
  return null;
}

/** Palabra aprendida (o aprendiéndose) que Nilo asocia a ese objeto, si la hay. */
export function recallSpokenWordForObject(vocabulary: Vocabulary, objectId: WorldObjectId): string | null {
  const stimulusId = OBJECT_STIMULUS_MAP[objectId];
  if (!stimulusId) return null;
  const entries = vocabulary.recall(stimulusId);
  const best = entries.find((item) => item.learned) ?? entries[0];
  if (!best) return null;
  return best.learned ? `¡«${best.word}»!` : `¿«${best.word}»…?`;
}

/** Dependencias vivas que necesita el camino guiado (todas DOM-free). */
export interface GuidedActionDeps {
  engine: BiochemEngine;
  world: CreatureWorld;
  brain: BrainV05Adapter;
  /** El modelo concreto: el refuerzo guiado apunta a una acción del codebook. */
  brainModel: Pick<BrainV05, 'getDebugState' | 'reinforce'>;
  actionSpace: readonly BrainAction[];
  /** Fotograma actual (contexto numérico del think; lo aporta el llamante). */
  getFrame: () => number;
  /** `true` = Nilo debe alcanzar físicamente el objeto (modo estricto del lab). */
  requireProximity: boolean;
}

/** Resultado del intento de aprendizaje guiado de UNA acción. */
export interface GuidedLearningOutcome {
  /** `false` ⇒ el cambio bioquímico fue mínimo; todavía no es aprendizaje. */
  evaluated: boolean;
  /** Recompensa calculada (signo: mejoró/empeoró), en [-1, 1]. */
  reward: number;
  /** Categoría del codebook reforzada (siempre no nula: se filtra antes). */
  category: BrainAction;
  /** `true` si el cerebro aceptó realmente el refuerzo. */
  learned: boolean;
  /** Texto de estado para el panel de aprendizaje. */
  status: string;
  /** Detalle para el registro de actividad (solo informativo). */
  detail: string;
  /** Salida del cerebro tras el think de aprendizaje; `null` si no se pensó. */
  brainOutput: BrainOutput | null;
}

/** Resultado completo de ejecutar una acción del mundo por una fuente dada. */
export interface GuidedActionOutcome {
  interaction: WorldActionResult;
  /** `true` si se aplicó impulso bioquímico (interaction.applied && impulse). */
  impulseApplied: boolean;
  /** Solo con fuente `manual` + impulso + categoría; `null` en caso contrario. */
  learning: GuidedLearningOutcome | null;
  /** Salida más reciente del cerebro (si el aprendizaje pensó). `null` = sin cambios. */
  brainOutput: BrainOutput | null;
  /** `true` ⇒ quien llame debe suprimir el refuerzo automático de la próxima decisión. */
  suppressNextAutoReward: boolean;
  /** Malestar actual tras la acción (solo si `suppressNextAutoReward`). */
  previousDiscomfort: number | null;
}

/**
 * Ejecuta una acción del hábitat para `source` y devuelve TODO lo que la
 * cara llamante debe reflejar (DOM o log). No toca ningún elemento gráfico.
 */
export function performGuidedAction(
  deps: GuidedActionDeps,
  actionId: string,
  source: ActionSource,
): GuidedActionOutcome {
  const interaction = deps.world.performAction(actionId, { requireProximity: deps.requireProximity });
  return applyGuidedInteraction(deps, interaction, source);
}

/**
 * Variante para interacciones YA disparadas por `world.advance()` (el bucle
 * del motor no debe volver a `performAction`: re-ejecutaría el impulso).
 */
export function applyGuidedInteraction(
  deps: GuidedActionDeps,
  interaction: WorldActionResult,
  source: ActionSource,
): GuidedActionOutcome {
  let impulseApplied = false;
  let learning: GuidedLearningOutcome | null = null;
  let brainOutput: BrainOutput | null = null;

  if (interaction.applied && interaction.impulse) {
    impulseApplied = true;
    const before = deps.engine.tick(0);
    deps.engine.applyImpulse(interaction.impulse);
    const after = deps.engine.tick(0);
    if (source === 'manual') {
      const evaluated = evaluateGuidedLearning(deps, interaction.actionId, before, after);
      if (evaluated) {
        learning = evaluated;
        brainOutput = evaluated.brainOutput;
      }
    }
  }

  const suppressNextAutoReward = source === 'manual' && interaction.applied;
  const previousDiscomfort = suppressNextAutoReward ? driveDiscomfort(deps.engine.tick(0).drives) : null;

  return {
    interaction,
    impulseApplied,
    learning,
    brainOutput,
    suppressNextAutoReward,
    previousDiscomfort,
  };
}

/**
 * Evalúa y registra un ejemplo guiado. Devuelve `null` si la acción no
 * corresponde a ninguna categoría del codebook (no intenta enseñar).
 * Equivale a `learnFromGuidedAction()` de `main.ts` sin efectos de interfaz.
 */
function evaluateGuidedLearning(
  deps: GuidedActionDeps,
  actionId: string,
  before: TickResult,
  after: TickResult,
): GuidedLearningOutcome | null {
  const categoryId = learningCategory(actionId);
  const category = deps.actionSpace.find((action) => action.id === categoryId);
  if (!category) return null;

  const reward = driveReductionReward(driveDiscomfort(before.drives), driveDiscomfort(after.drives));
  const label = worldActionLabel(actionId);

  if (Math.abs(reward) < 0.01) {
    return {
      evaluated: false,
      reward,
      category,
      learned: false,
      status: `Nilo hizo «${label}», pero sus necesidades apenas cambiaron; todavía no cuenta como aprendizaje.`,
      detail: '',
      brainOutput: null,
    };
  }

  // Fija el contexto actual como traza y refuerza la categoría elegida.
  deps.brain.think(brainInputs(before, deps.getFrame()));
  const previousReinforces = deps.brainModel.getDebugState().reinforces;
  deps.brainModel.reinforce(category.value, reward);
  const learned = deps.brainModel.getDebugState().reinforces > previousReinforces;
  const snapshot = deps.engine.tick(0);
  const brainOutput = deps.brain.think(brainInputs(snapshot, deps.getFrame()));

  const direction = reward > 0 ? 'mejoró' : 'empeoró';
  const sign = reward > 0 ? '+' : '−';
  const status = learned
    ? `Aprendió: «${category.name}» ${direction} sus necesidades después de «${label}». Ahora esa preferencia pesa más en un estado parecido.`
    : 'No se pudo registrar el ejemplo en el cerebro.';
  const detail = `Aprendizaje guiado · ${category.name}: ${direction} tras «${label}» (refuerzo ${sign}${Math.abs(reward).toFixed(2)}).`;

  return {
    evaluated: true,
    reward,
    category,
    learned,
    status,
    detail,
    brainOutput,
  };
}
