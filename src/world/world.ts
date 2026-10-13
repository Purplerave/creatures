/**
 * Mundo mínimo basado en objetos y eventos (primer corte de Fase 4).
 *
 * El cerebro elige un verbo; este módulo lo resuelve contra un objeto del
 * mundo y devuelve un impulso bioquímico determinista. No conoce el motor ni
 * escribe drives/químicos: `BiochemEngine.applyImpulse()` sigue siendo la
 * autoridad del estado. Todavía no hay movimiento, colisiones ni habitaciones.
 */
import type { BiochemicalImpulse } from '../contracts/types';

export type WorldActionId = 'descansar' | 'acurrucarse' | 'observar' | 'explorar' | 'buscar';
export type WorldObjectId = 'nido' | 'comedero' | 'pelota' | 'luz-suave';

export interface WorldObjectDefinition {
  id: WorldObjectId;
  name: string;
  icon: string;
  description: string;
  /** Verbos del cerebro que pueden usar este objeto. */
  actions: readonly WorldActionId[];
  /** Segundos simulados hasta que el objeto puede usarse de nuevo. */
  cooldownSeconds: number;
}

export interface WorldObjectState extends WorldObjectDefinition {
  cooldownRemaining: number;
  uses: number;
  ready: boolean;
}

export interface WorldActionResult {
  actionId: WorldActionId;
  objectId: WorldObjectId;
  applied: boolean;
  message: string;
  /** `null` si el objeto todavía está en enfriamiento. */
  impulse: BiochemicalImpulse | null;
}

export interface WorldSnapshot {
  objects: WorldObjectState[];
  lastInteraction: WorldActionResult | null;
}

export const WORLD_OBJECTS: readonly WorldObjectDefinition[] = [
  {
    id: 'nido',
    name: 'Nido mullido',
    icon: '🪺',
    description: 'Descansar recupera energía; acurrucarse da confort y vínculo.',
    actions: ['descansar', 'acurrucarse'],
    cooldownSeconds: 0.35,
  },
  {
    id: 'comedero',
    name: 'Comedero',
    icon: '🍎',
    description: 'Buscar estímulo permite comer y reponer glucosa.',
    actions: ['buscar'],
    cooldownSeconds: 1.5,
  },
  {
    id: 'pelota',
    name: 'Pelota',
    icon: '⚽',
    description: 'Explorar la pelota alivia el aburrimiento y libera dopamina.',
    actions: ['explorar'],
    cooldownSeconds: 1,
  },
  {
    id: 'luz-suave',
    name: 'Luz suave',
    icon: '💡',
    description: 'Observar la luz estimula la curiosidad y calma el miedo.',
    actions: ['observar'],
    cooldownSeconds: 0.75,
  },
] as const;

interface InteractionDefinition {
  objectId: WorldObjectId;
  message: string;
  impulse: BiochemicalImpulse;
}

/**
 * Mapeo provisional, explícito y ajustable entre los cinco verbos del cerebro,
 * objetos y consecuencias. Las magnitudes son puntos de drive por interacción.
 */
const INTERACTIONS: Record<WorldActionId, InteractionDefinition> = {
  descansar: {
    objectId: 'nido',
    message: 'Nilo descansa en el nido: baja el sueño y recupera energía.',
    impulse: {
      drives: { sueno: -0.055, energia: 0.035 },
      chemicals: { adenosina: -0.025 },
    },
  },
  acurrucarse: {
    objectId: 'nido',
    message: 'Nilo se acurruca: gana confort y vínculo, y baja el miedo.',
    impulse: {
      drives: { miedo: -0.035, confort: 0.035, vinculo: 0.025 },
      chemicals: { oxitocina: 0.04 },
    },
  },
  observar: {
    objectId: 'luz-suave',
    message: 'Nilo observa la luz suave: se calma y aumenta su curiosidad.',
    impulse: {
      drives: { miedo: -0.02, curiosidad: 0.025, aburrimiento: -0.015 },
      chemicals: { serotonina: 0.025 },
    },
  },
  explorar: {
    objectId: 'pelota',
    message: 'Nilo explora la pelota: baja el aburrimiento y sube la curiosidad.',
    impulse: {
      drives: { aburrimiento: -0.045, curiosidad: 0.02, energia: -0.01 },
      chemicals: { dopamina: 0.06 },
    },
  },
  buscar: {
    objectId: 'comedero',
    message: 'Nilo encuentra comida: baja el hambre y recupera energía.',
    impulse: {
      drives: { hambre: -0.09, energia: 0.035 },
      chemicals: { glucosa: 0.12, dopamina: 0.025 },
    },
  },
};

interface MutableObjectState {
  cooldownRemaining: number;
  uses: number;
}

function copyImpulse(impulse: BiochemicalImpulse | null): BiochemicalImpulse | null {
  if (!impulse) return null;
  return {
    drives: impulse.drives ? { ...impulse.drives } : undefined,
    chemicals: impulse.chemicals ? { ...impulse.chemicals } : undefined,
  };
}

function copyResult(result: WorldActionResult | null): WorldActionResult | null {
  return result ? { ...result, impulse: copyImpulse(result.impulse) } : null;
}

/** Mundo discreto, pequeño y completamente determinista. */
export class CreatureWorld {
  private readonly states = new Map<WorldObjectId, MutableObjectState>();
  private lastInteraction: WorldActionResult | null = null;

  constructor() {
    for (const object of WORLD_OBJECTS) {
      this.states.set(object.id, { cooldownRemaining: 0, uses: 0 });
    }
  }

  /** Avanza los enfriamientos usando tiempo simulado (no tiempo de pared). */
  advance(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      throw new RangeError(`dt de mundo inválido: ${String(dtSeconds)}`);
    }
    for (const state of this.states.values()) {
      state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dtSeconds);
    }
  }

  /**
   * Ejecuta un verbo del cerebro contra su objeto asociado.
   * Si el objeto se recupera, no hay efecto bioquímico ni se cuenta un uso.
   */
  performAction(actionId: string): WorldActionResult {
    if (!Object.hasOwn(INTERACTIONS, actionId)) {
      throw new RangeError(`Acción del mundo desconocida: ${String(actionId)}`);
    }
    const action = actionId as WorldActionId;
    const definition = INTERACTIONS[action];
    const object = WORLD_OBJECTS.find((candidate) => candidate.id === definition.objectId);
    const state = this.states.get(definition.objectId);
    if (!object || !state) throw new Error(`Estado de objeto incompleto: ${definition.objectId}`);

    if (state.cooldownRemaining > 0) {
      const result: WorldActionResult = {
        actionId: action,
        objectId: object.id,
        applied: false,
        message: `${object.name} se está recuperando (${state.cooldownRemaining.toFixed(1)} s).`,
        impulse: null,
      };
      this.lastInteraction = result;
      return copyResult(result)!;
    }

    state.cooldownRemaining = object.cooldownSeconds;
    state.uses += 1;
    const result: WorldActionResult = {
      actionId: action,
      objectId: object.id,
      applied: true,
      message: definition.message,
      impulse: copyImpulse(definition.impulse),
    };
    this.lastInteraction = result;
    return copyResult(result)!;
  }

  /** Snapshot con copias: modificarlo no cambia el mundo. */
  getSnapshot(): WorldSnapshot {
    return {
      objects: WORLD_OBJECTS.map((object) => {
        const state = this.states.get(object.id);
        if (!state) throw new Error(`Estado de objeto incompleto: ${object.id}`);
        return {
          ...object,
          actions: [...object.actions],
          cooldownRemaining: state.cooldownRemaining,
          uses: state.uses,
          ready: state.cooldownRemaining <= 0,
        };
      }),
      lastInteraction: copyResult(this.lastInteraction),
    };
  }
}
