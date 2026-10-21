/**
 * Mundo espacial y de eventos (Fase 4 completa + serialización Fase 5).
 *
 * Combina dos modos 100 % deterministas y compatibles entre sí:
 *  1. Interacción directa (`performAction(actionId)`): resuelve el verbo contra
 *     su objeto asociado respetando enfriamientos y dirige a Nilo hacia la
 *     posición espacial del objeto. Si se pasa `{ requireProximity: true }`,
 *     solo dispara el efecto cuando Nilo entra en `object.interactionRadius`.
 *  2. Navegación espacial autónoma (`setGoalAction(actionId)` + `advance(dt)`):
 *     Nilo camina por el plano 2D del hábitat (`[0, 1] × [0, 1]`) a velocidad
 *     finita sin sobrepaso (*overshoot*) y activa automáticamente la acción
 *     pendiente en el instante exacto en que alcanza el radio del objeto.
 *
 * No conoce `BiochemEngine` ni muta drives/químicos directamente: devuelve
 * lotes `BiochemicalImpulse` para que el motor conserve la autoridad total.
 */
import type { BiochemicalImpulse } from '../contracts/types';

/** Versión del esquema de serialización del mundo (Fase 5). */
export const WORLD_SCHEMA_VERSION = 3;

/** Velocidad base de desplazamiento en unidades normalizadas de hábitat por segundo. */
export const DEFAULT_WALK_SPEED = 0.78;

/** Posición inicial de Nilo en el centro del suelo del hábitat. */
export const INITIAL_CREATURE_POSITION = { x: 0.5, y: 0.66 } as const;

export type WorldActionId = 'descansar' | 'acurrucarse' | 'observar' | 'explorar' | 'buscar' | 'atravesar' | 'mirar' | 'tocar' | 'abrazar';
export type WorldObjectId = 'nido' | 'comedero' | 'pelota' | 'luz-suave' | 'tunel' | 'ventana' | 'xilofono' | 'peluche';

/** Coordenada 2D normalizada en el escenario del hábitat (`0..1`). */
export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldObjectDefinition {
  id: WorldObjectId;
  name: string;
  icon: string;
  description: string;
  /** Zona espacial legible dentro del hábitat. */
  zoneLabel: string;
  /** Coordenada normalizada `(0..1, 0..1)` del objeto en el escenario. */
  position: Vec2;
  /** Radio de alcance espacial para activar el objeto al acercarse. */
  interactionRadius: number;
  /** Verbos del cerebro que pueden usar este objeto. */
  actions: readonly WorldActionId[];
  /** Segundos simulados hasta que el objeto puede usarse de nuevo. */
  cooldownSeconds: number;
}

export interface WorldObjectState extends WorldObjectDefinition {
  cooldownRemaining: number;
  uses: number;
  ready: boolean;
  /** Distancia euclídea actual entre Nilo y este objeto. */
  distance: number;
  /** `true` si Nilo se encuentra dentro del radio de interacción. */
  inRange: boolean;
}

/** Estado cinemático 2D del cuerpo de la criatura en el hábitat. */
export interface CreatureBodyState {
  position: Vec2;
  velocity: Vec2;
  /** Orientación horizontal (`-1` mira a la izquierda, `1` mira a la derecha). */
  heading: -1 | 1;
  speed: number;
  targetObjectId: WorldObjectId | null;
  targetPosition: Vec2 | null;
  pendingActionId: WorldActionId | null;
  distanceToTarget: number;
  arrived: boolean;
  distanceTraveled: number;
}

export interface WorldActionResult {
  actionId: WorldActionId;
  objectId: WorldObjectId;
  applied: boolean;
  message: string;
  /** `null` si el objeto está en enfriamiento o fuera de alcance espacial. */
  impulse: BiochemicalImpulse | null;
}

/** Resultado de un paso temporal `advance(dtSeconds)`. */
export interface WorldStepResult {
  moved: boolean;
  distanceDelta: number;
  arrived: boolean;
  /** Interacción disparada automáticamente al llegar a un objetivo espacial pendiente. */
  triggeredInteraction: WorldActionResult | null;
}

export interface PerformActionOptions {
  /** Si es `true`, exige estar dentro de `interactionRadius` o inicia el desplazamiento hacia él. */
  requireProximity?: boolean;
}

export interface CreatureWorldOptions {
  initialPosition?: Vec2;
  walkSpeed?: number;
}

export interface WorldSnapshot {
  objects: WorldObjectState[];
  creature: CreatureBodyState;
  lastInteraction: WorldActionResult | null;
}

interface SerializedWorldState {
  schemaVersion: number;
  objects: Record<WorldObjectId, { cooldownRemaining: number; uses: number }>;
  creature: {
    position: Vec2;
    velocity: Vec2;
    heading: -1 | 1;
    speed: number;
    targetObjectId: WorldObjectId | null;
    /** Destino de una orden manual de movimiento (ausente en partidas schema v1). */
    manualTargetPosition?: Vec2 | null;
    pendingActionId: WorldActionId | null;
    distanceTraveled: number;
  };
  lastInteraction: WorldActionResult | null;
}

export const WORLD_OBJECTS: readonly WorldObjectDefinition[] = [
  {
    id: 'nido',
    name: 'Nido mullido',
    icon: '🪺',
    description: 'Descansar recupera energía; acurrucarse da confort y vínculo.',
    zoneLabel: 'Zona de descanso · Oeste',
    position: { x: 0.16, y: 0.69 },
    interactionRadius: 0.11,
    actions: ['descansar', 'acurrucarse'],
    cooldownSeconds: 0.35,
  },
  {
    id: 'comedero',
    name: 'Comedero',
    icon: '🍎',
    description: 'Buscar estímulo permite comer y reponer glucosa.',
    zoneLabel: 'Zona de comida · Este',
    position: { x: 0.84, y: 0.69 },
    interactionRadius: 0.11,
    actions: ['buscar'],
    cooldownSeconds: 1.5,
  },
  {
    id: 'pelota',
    name: 'Pelota',
    icon: '⚽',
    description: 'Explorar la pelota alivia el aburrimiento y libera dopamina.',
    zoneLabel: 'Zona de juego · Centro',
    position: { x: 0.36, y: 0.78 },
    interactionRadius: 0.11,
    actions: ['explorar'],
    cooldownSeconds: 1,
  },
  {
    id: 'luz-suave',
    name: 'Luz suave',
    icon: '💡',
    description: 'Observar la luz estimula la curiosidad y calma el miedo.',
    zoneLabel: 'Zona tranquila · Este',
    position: { x: 0.66, y: 0.45 },
    interactionRadius: 0.12,
    actions: ['observar'],
    cooldownSeconds: 0.75,
  },
  {
    id: 'tunel', name: 'Túnel de tela', icon: '🕳️',
    description: 'Atravesar el túnel consume energía y reduce el aburrimiento.',
    zoneLabel: 'Zona de juego · Centro', position: { x: 0.49, y: 0.74 },
    interactionRadius: 0.12, actions: ['atravesar'], cooldownSeconds: 1.2,
  },
  {
    id: 'ventana', name: 'Ventana al jardín', icon: '🪟',
    description: 'Mirar el jardín despierta la curiosidad y calma a Nilo.',
    zoneLabel: 'Zona tranquila · Este', position: { x: 0.9, y: 0.42 },
    interactionRadius: 0.12, actions: ['mirar'], cooldownSeconds: 0.9,
  },
  {
    id: 'xilofono', name: 'Xilófono de madera', icon: '🎵',
    description: 'Tocar una melodía estimula la curiosidad y el bienestar.',
    zoneLabel: 'Zona de juego · Centro', position: { x: 0.58, y: 0.79 },
    interactionRadius: 0.12, actions: ['tocar'], cooldownSeconds: 1,
  },
  {
    id: 'peluche', name: 'Peluche compañero', icon: '🧸',
    description: 'Abrazar al peluche da confort, vínculo y seguridad.',
    zoneLabel: 'Zona de descanso · Oeste', position: { x: 0.25, y: 0.5 },
    interactionRadius: 0.12, actions: ['abrazar'], cooldownSeconds: 0.8,
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
  atravesar: {
    objectId: 'tunel',
    message: 'Nilo atraviesa el túnel: juega, descubre el otro lado y gasta un poco de energía.',
    impulse: { drives: { aburrimiento: -0.055, curiosidad: 0.035, energia: -0.025 }, chemicals: { dopamina: 0.045 } },
  },
  mirar: {
    objectId: 'ventana',
    message: 'Nilo mira el jardín: aumenta su curiosidad y baja el miedo.',
    impulse: { drives: { curiosidad: 0.045, miedo: -0.03, aburrimiento: -0.02 }, chemicals: { serotonina: 0.035 } },
  },
  tocar: {
    objectId: 'xilofono',
    message: 'Nilo toca el xilófono: descubre sonidos y se anima.',
    impulse: { drives: { curiosidad: 0.035, aburrimiento: -0.035, confort: 0.015 }, chemicals: { dopamina: 0.045 } },
  },
  abrazar: {
    objectId: 'peluche',
    message: 'Nilo abraza a su peluche: gana confort y vínculo, y se siente seguro.',
    impulse: { drives: { miedo: -0.045, confort: 0.04, vinculo: 0.035 }, chemicals: { oxitocina: 0.05 } },
  },
};

export const WORLD_ACTION_LABELS: Record<WorldActionId, string> = {
  descansar: 'Descansar',
  acurrucarse: 'Acurrucarse',
  observar: 'Observar la luz',
  explorar: 'Jugar con la pelota',
  buscar: 'Buscar comida',
  atravesar: 'Atravesar el túnel',
  mirar: 'Mirar el jardín',
  tocar: 'Tocar el xilófono',
  abrazar: 'Abrazar el peluche',
};

interface MutableObjectState {
  cooldownRemaining: number;
  uses: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distance2D(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function copyVec2(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
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

/** Mundo espacial + de eventos, pequeño y 100 % determinista. */
export class CreatureWorld {
  private readonly states = new Map<WorldObjectId, MutableObjectState>();
  private position: Vec2;
  private velocity: Vec2 = { x: 0, y: 0 };
  private heading: -1 | 1 = 1;
  private speed: number;
  private targetObjectId: WorldObjectId | null = null;
  private manualTargetPosition: Vec2 | null = null;
  private pendingActionId: WorldActionId | null = null;
  private distanceTraveled = 0;
  private lastInteraction: WorldActionResult | null = null;

  constructor(options: CreatureWorldOptions = {}) {
    const start = options.initialPosition ?? INITIAL_CREATURE_POSITION;
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) {
      throw new RangeError('initialPosition inválida en CreatureWorld');
    }
    const speed = options.walkSpeed ?? DEFAULT_WALK_SPEED;
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError(`walkSpeed inválida en CreatureWorld: ${String(speed)}`);
    }
    this.position = { x: clamp01(start.x), y: clamp01(start.y) };
    this.speed = speed;

    for (const object of WORLD_OBJECTS) {
      this.states.set(object.id, { cooldownRemaining: 0, uses: 0 });
    }
  }

  /** Fija un verbo como destino espacial: Nilo caminará hacia el objeto y lo usará al llegar. */
  setGoalAction(actionId: string): WorldObjectDefinition {
    const action = this.validateActionId(actionId);
    const definition = INTERACTIONS[action];
    const object = this.findObjectOrThrow(definition.objectId);
    this.targetObjectId = object.id;
    this.manualTargetPosition = null;
    this.pendingActionId = action;
    if (object.position.x - this.position.x > 1e-4) this.heading = 1;
    else if (object.position.x - this.position.x < -1e-4) this.heading = -1;
    return { ...object, position: copyVec2(object.position), actions: [...object.actions] };
  }

  /** Mueve instantáneamente a Nilo a una coordenada válida del hábitat (`0..1`). */
  moveCreatureTo(point: Vec2): void {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError('Coordenada inválida para moveCreatureTo');
    }
    this.position = { x: clamp01(point.x), y: clamp01(point.y) };
    this.velocity = { x: 0, y: 0 };
    this.targetObjectId = null;
    this.manualTargetPosition = null;
    this.pendingActionId = null;
  }

  /** Fija un destino libre para que Nilo camine hacia una posición del hábitat. */
  walkCreatureTo(point: Vec2): void {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError('Coordenada inválida para walkCreatureTo');
    }
    const destination = { x: clamp01(point.x), y: clamp01(point.y) };
    this.targetObjectId = null;
    this.manualTargetPosition = destination;
    this.pendingActionId = null;
    if (destination.x - this.position.x > 1e-4) this.heading = 1;
    else if (destination.x - this.position.x < -1e-4) this.heading = -1;
  }

  /** Detecta si un clic en coordenadas normalizadas `(0..1, 0..1)` cae sobre un objeto del mundo. */
  hitTestObject(point: Vec2, tolerance = 0.09): WorldObjectState | null {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const snapshot = this.getSnapshot();
    let best: { obj: WorldObjectState; dist: number } | null = null;
    for (const obj of snapshot.objects) {
      const dist = distance2D(point, obj.position);
      if (dist <= Math.max(tolerance, obj.interactionRadius * 0.85)) {
        if (!best || dist < best.dist) best = { obj, dist };
      }
    }
    return best ? best.obj : null;
  }

  /**
   * Avanza enfriamientos y cinemática 2D usando tiempo simulado (nunca reloj real).
   * Si hay una acción espacial pendiente y Nilo entra en `interactionRadius`,
   * dispara automáticamente la interacción y la devuelve en `triggeredInteraction`.
   */
  advance(dtSeconds: number): WorldStepResult {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      throw new RangeError(`dt de mundo inválido: ${String(dtSeconds)}`);
    }
    for (const state of this.states.values()) {
      state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dtSeconds);
    }

    let moved = false;
    let distanceDelta = 0;
    let arrived = false;
    let triggeredInteraction: WorldActionResult | null = null;

    if (this.targetObjectId) {
      this.manualTargetPosition = null;
      const target = this.findObjectOrThrow(this.targetObjectId);
      const targetStandSpot = this.standPositionForObject(target);
      const dx = targetStandSpot.x - this.position.x;
      const dy = targetStandSpot.y - this.position.y;
      const remaining = Math.hypot(dx, dy);

      if (Math.abs(dx) > 1e-4) this.heading = dx >= 0 ? 1 : -1;

      if (dtSeconds > 0 && remaining > 1e-6) {
        const step = Math.min(remaining, this.speed * dtSeconds);
        const ux = dx / remaining;
        const uy = dy / remaining;
        this.position = {
          x: clamp01(this.position.x + ux * step),
          y: clamp01(this.position.y + uy * step),
        };
        this.velocity = step < remaining ? { x: ux * this.speed, y: uy * this.speed } : { x: 0, y: 0 };
        this.distanceTraveled += step;
        distanceDelta = step;
        moved = step > 0;
      } else {
        this.velocity = { x: 0, y: 0 };
      }

      const distToObject = distance2D(this.position, target.position);
      arrived = distToObject <= target.interactionRadius + 1e-6 || distance2D(this.position, targetStandSpot) <= 1e-4;

      const targetReady = (this.states.get(target.id)?.cooldownRemaining ?? 0) <= 0;
      if (arrived && targetReady && this.pendingActionId !== null) {
        const actionToRun = this.pendingActionId;
        this.pendingActionId = null;
        triggeredInteraction = this.executeImmediateInteraction(actionToRun);
      }
    } else if (this.manualTargetPosition) {
      const dx = this.manualTargetPosition.x - this.position.x;
      const dy = this.manualTargetPosition.y - this.position.y;
      const remaining = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1e-4) this.heading = dx >= 0 ? 1 : -1;
      if (dtSeconds > 0 && remaining > 1e-6) {
        const step = Math.min(remaining, this.speed * dtSeconds);
        const ux = dx / remaining;
        const uy = dy / remaining;
        this.position = {
          x: clamp01(this.position.x + ux * step),
          y: clamp01(this.position.y + uy * step),
        };
        this.velocity = step < remaining ? { x: ux * this.speed, y: uy * this.speed } : { x: 0, y: 0 };
        this.distanceTraveled += step;
        distanceDelta = step;
        moved = step > 0;
      } else {
        this.velocity = { x: 0, y: 0 };
      }
      arrived = remaining <= this.speed * dtSeconds + 1e-6;
    } else {
      this.velocity = { x: 0, y: 0 };
    }

    return { moved, distanceDelta, arrived, triggeredInteraction };
  }

  /**
   * Ejecuta un verbo del cerebro contra su objeto asociado.
   * Por defecto (`requireProximity: false`) mantiene compatibilidad total con
   * el contrato de eventos y encamina a Nilo hacia el objeto; con
   * `requireProximity: true`, exige alcance físico en el hábitat.
   */
  performAction(actionId: string, options: PerformActionOptions = {}): WorldActionResult {
    const action = this.validateActionId(actionId);
    const definition = INTERACTIONS[action];
    const object = this.findObjectOrThrow(definition.objectId);

    this.targetObjectId = object.id;
    this.manualTargetPosition = null;
    const dx = object.position.x - this.position.x;
    if (Math.abs(dx) > 1e-4) this.heading = dx >= 0 ? 1 : -1;

    const currentDistance = distance2D(this.position, object.position);
    const objectReady = (this.states.get(object.id)?.cooldownRemaining ?? 0) <= 0;
    if (options.requireProximity && (currentDistance > object.interactionRadius + 1e-6 || !objectReady)) {
      this.pendingActionId = action;
      const enRoute: WorldActionResult = {
        actionId: action,
        objectId: object.id,
        applied: false,
        message:
          currentDistance > object.interactionRadius + 1e-6
            ? `Nilo se desplaza hacia ${object.name} (distancia ${(currentDistance * 100).toFixed(0)} %).`
            : `Nilo aguarda junto a ${object.name} mientras termina su enfriamiento.`,
        impulse: null,
      };
      this.lastInteraction = enRoute;
      return copyResult(enRoute)!;
    }

    this.pendingActionId = null;
    return this.executeImmediateInteraction(action);
  }

  /** Snapshot aislado con copias defensivas: mutarlo nunca altera el mundo. */
  getSnapshot(): WorldSnapshot {
    const target = this.targetObjectId ? this.findObjectOrThrow(this.targetObjectId) : null;
    const targetStand = target ? this.standPositionForObject(target) : null;
    const visibleTarget = targetStand ?? this.manualTargetPosition;
    const distToTarget = target
      ? distance2D(this.position, target.position)
      : this.manualTargetPosition
        ? distance2D(this.position, this.manualTargetPosition)
        : 0;

    return {
      objects: WORLD_OBJECTS.map((object) => {
        const state = this.states.get(object.id);
        if (!state) throw new Error(`Estado de objeto incompleto: ${object.id}`);
        const dist = distance2D(this.position, object.position);
        return {
          ...object,
          position: copyVec2(object.position),
          actions: [...object.actions],
          cooldownRemaining: state.cooldownRemaining,
          uses: state.uses,
          ready: state.cooldownRemaining <= 0,
          distance: dist,
          inRange: dist <= object.interactionRadius + 1e-6,
        };
      }),
      creature: {
        position: copyVec2(this.position),
        velocity: copyVec2(this.velocity),
        heading: this.heading,
        speed: this.speed,
        targetObjectId: this.targetObjectId,
        targetPosition: visibleTarget ? copyVec2(visibleTarget) : null,
        pendingActionId: this.pendingActionId,
        distanceToTarget: distToTarget,
        arrived: target
          ? distToTarget <= target.interactionRadius + 1e-6
          : this.manualTargetPosition !== null && distToTarget <= 1e-6,
        distanceTraveled: this.distanceTraveled,
      },
      lastInteraction: copyResult(this.lastInteraction),
    };
  }

  /** Serializa de forma determinista el estado completo del mundo y del cuerpo espacial. */
  serialize(): string {
    const objects = {} as Record<WorldObjectId, { cooldownRemaining: number; uses: number }>;
    for (const def of WORLD_OBJECTS) {
      const state = this.states.get(def.id)!;
      objects[def.id] = {
        cooldownRemaining: state.cooldownRemaining,
        uses: state.uses,
      };
    }
    const payload: SerializedWorldState = {
      schemaVersion: WORLD_SCHEMA_VERSION,
      objects,
      creature: {
        position: copyVec2(this.position),
        velocity: copyVec2(this.velocity),
        heading: this.heading,
        speed: this.speed,
        targetObjectId: this.targetObjectId,
        manualTargetPosition: this.manualTargetPosition ? copyVec2(this.manualTargetPosition) : null,
        pendingActionId: this.pendingActionId,
        distanceTraveled: this.distanceTraveled,
      },
      lastInteraction: copyResult(this.lastInteraction),
    };
    return JSON.stringify(payload);
  }

  /** Restaura un estado serializado de forma atómica (todo o nada). */
  deserialize(json: string): void {
    if (typeof json !== 'string') throw new RangeError('deserialize espera un string JSON');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RangeError('JSON de mundo inválido');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('Mundo serializado debe ser un objeto JSON');
    }
    const candidate = parsed as Partial<SerializedWorldState>;
    if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2 && candidate.schemaVersion !== WORLD_SCHEMA_VERSION) {
      throw new RangeError(
        `schemaVersion de mundo no soportada: ${String(candidate.schemaVersion)} (soportadas: 1, 2 y ${WORLD_SCHEMA_VERSION})`,
      );
    }
    if (typeof candidate.objects !== 'object' || candidate.objects === null) {
      throw new RangeError('objects serializados inválidos en mundo');
    }

    const nextStates = new Map<WorldObjectId, MutableObjectState>();
    for (const def of WORLD_OBJECTS) {
      const raw = candidate.objects[def.id];
      if (!raw || typeof raw !== 'object') {
        if ((candidate.schemaVersion ?? 0) < WORLD_SCHEMA_VERSION) {
          nextStates.set(def.id, { cooldownRemaining: 0, uses: 0 });
          continue;
        }
        throw new RangeError(`Falta el estado serializado del objeto ${def.id}`);
      }
      if (typeof raw.cooldownRemaining !== 'number' || !Number.isFinite(raw.cooldownRemaining) || raw.cooldownRemaining < 0) {
        throw new RangeError(`cooldownRemaining inválido para ${def.id}`);
      }
      if (typeof raw.uses !== 'number' || !Number.isInteger(raw.uses) || raw.uses < 0) {
        throw new RangeError(`uses inválido para ${def.id}`);
      }
      nextStates.set(def.id, { cooldownRemaining: raw.cooldownRemaining, uses: raw.uses });
    }

    const rawCreature = candidate.creature;
    if (!rawCreature || typeof rawCreature !== 'object') {
      throw new RangeError('creature serializado inválido en mundo');
    }
    const pos = rawCreature.position;
    const vel = rawCreature.velocity;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      throw new RangeError('Posición serializada inválida en mundo');
    }
    if (!vel || !Number.isFinite(vel.x) || !Number.isFinite(vel.y)) {
      throw new RangeError('Velocidad serializada inválida en mundo');
    }
    if (rawCreature.heading !== -1 && rawCreature.heading !== 1) {
      throw new RangeError(`heading inválido en mundo: ${String(rawCreature.heading)}`);
    }
    if (typeof rawCreature.speed !== 'number' || !Number.isFinite(rawCreature.speed) || rawCreature.speed <= 0) {
      throw new RangeError(`speed inválida en mundo: ${String(rawCreature.speed)}`);
    }
    if (
      rawCreature.targetObjectId !== null &&
      !WORLD_OBJECTS.some((item) => item.id === rawCreature.targetObjectId)
    ) {
      throw new RangeError(`targetObjectId desconocido: ${String(rawCreature.targetObjectId)}`);
    }
    if (rawCreature.pendingActionId !== null) {
      this.validateActionId(rawCreature.pendingActionId);
    }
    const rawManualTarget = rawCreature.manualTargetPosition;
    if ((candidate.schemaVersion ?? 0) >= 2 && !Object.hasOwn(rawCreature, 'manualTargetPosition')) {
      throw new RangeError('manualTargetPosition ausente en mundo schema v2+');
    }
    if (rawManualTarget !== undefined && rawManualTarget !== null) {
      if (
        typeof rawManualTarget !== 'object' ||
        !Number.isFinite(rawManualTarget.x) ||
        !Number.isFinite(rawManualTarget.y) ||
        rawCreature.targetObjectId !== null
      ) {
        throw new RangeError('manualTargetPosition inválida o incompatible con un destino de objeto');
      }
    }
    if (
      typeof rawCreature.distanceTraveled !== 'number' ||
      !Number.isFinite(rawCreature.distanceTraveled) ||
      rawCreature.distanceTraveled < 0
    ) {
      throw new RangeError('distanceTraveled inválido en mundo');
    }

    // Escritura atómica tras validar el lote completo.
    for (const [id, st] of nextStates) this.states.set(id, st);
    this.position = { x: clamp01(pos.x), y: clamp01(pos.y) };
    this.velocity = { x: vel.x, y: vel.y };
    this.heading = rawCreature.heading;
    this.speed = rawCreature.speed;
    this.targetObjectId = rawCreature.targetObjectId;
    this.manualTargetPosition = rawManualTarget ? {
      x: clamp01(rawManualTarget.x),
      y: clamp01(rawManualTarget.y),
    } : null;
    this.pendingActionId = rawCreature.pendingActionId;
    this.distanceTraveled = rawCreature.distanceTraveled;
    this.lastInteraction = copyResult(candidate.lastInteraction ?? null);
  }

  private validateActionId(actionId: string): WorldActionId {
    if (!Object.hasOwn(INTERACTIONS, actionId)) {
      throw new RangeError(`Acción del mundo desconocida: ${String(actionId)}`);
    }
    return actionId as WorldActionId;
  }

  private findObjectOrThrow(objectId: WorldObjectId): WorldObjectDefinition {
    const object = WORLD_OBJECTS.find((candidate) => candidate.id === objectId);
    if (!object) throw new Error(`Objeto desconocido: ${objectId}`);
    return object;
  }

  /** Punto de parada natural en el suelo frente a cada objeto (p. ej. bajo la lámpara). */
  private standPositionForObject(object: WorldObjectDefinition): Vec2 {
    return {
      x: clamp01(object.position.x),
      y: clamp01(Math.max(0.58, object.position.y)),
    };
  }

  private executeImmediateInteraction(action: WorldActionId): WorldActionResult {
    const definition = INTERACTIONS[action];
    const object = this.findObjectOrThrow(definition.objectId);
    const state = this.states.get(definition.objectId);
    if (!state) throw new Error(`Estado de objeto incompleto: ${definition.objectId}`);

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
}
