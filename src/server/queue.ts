/**
 * Cola de gestos + rate-limit (S2, PLAN-PUBLICO §3).
 *
 * «El endpoint solo encola; el tick del motor los convierte en estímulos»
 * (suman, no ordenan). Reglas:
 *  - Rate-limit: **1 gesto / 5 s**, medido POR IP y POR cookie `nilo_id`
 *    (los dos contadores deben pasar; se actualizan solo si se encola).
 *  - Cola con capacidad 20 (FIFO). Llena ⇒ se rechaza con `cola_llena`.
 *  - Sin aleatoriedad: solo `Date.now()` para las ventanas.
 */
import type { GestureKind } from '../habitat/actions';

/** Ventana de rate-limit por defecto (milisegundos). */
export const DEFAULT_GESTURE_RATE_LIMIT_MS = 5000;
/** Capacidad máxima de la cola de gestos. */
export const DEFAULT_GESTURE_QUEUE_CAP = 20;

/** Un gesto ya validado, esperando al próximo tick. */
export interface QueuedGesture {
  kind: GestureKind;
  /** Palabra normalizada (solo para `teach`). */
  word?: string;
  ip: string;
  clientId: string;
  /** `Date.now()` del encolado (para el log de gestos). */
  at: number;
}

/** Resultado de intentar encolar. */
export type EnqueueResult =
  | { status: 'encolado'; queueSize: number }
  | { status: 'rate_limited'; retryAfterMs: number }
  | { status: 'cola_llena'; cap: number };

export interface GestureBoardOptions {
  rateLimitMs?: number;
  queueCap?: number;
}

/** Tablero FIFO de gestos con cuota por IP y por cookie. */
export class GestureBoard {
  private readonly rateLimitMs: number;
  private readonly queueCap: number;
  private readonly queue: QueuedGesture[] = [];
  private readonly lastByIp = new Map<string, number>();
  private readonly lastByClient = new Map<string, number>();

  constructor(options: GestureBoardOptions = {}) {
    this.rateLimitMs = options.rateLimitMs ?? DEFAULT_GESTURE_RATE_LIMIT_MS;
    this.queueCap = options.queueCap ?? DEFAULT_GESTURE_QUEUE_CAP;
    if (!Number.isFinite(this.rateLimitMs) || this.rateLimitMs < 0) {
      throw new RangeError('rateLimitMs inválido');
    }
    if (!Number.isInteger(this.queueCap) || this.queueCap < 1) {
      throw new RangeError('queueCap inválido');
    }
  }

  /** Gestos pendientes. */
  get size(): number {
    return this.queue.length;
  }

  /** Aplica cuotas y, si todo pasa, encola al final (FIFO). */
  enqueue(
    input: { kind: GestureKind; word?: string; ip: string; clientId: string },
    now = Date.now(),
  ): EnqueueResult {
    const lastIp = this.lastByIp.get(input.ip);
    const lastClient = this.lastByClient.get(input.clientId);
    const waitedIp = lastIp === undefined ? Number.POSITIVE_INFINITY : now - lastIp;
    const waitedClient = lastClient === undefined ? Number.POSITIVE_INFINITY : now - lastClient;
    if (waitedIp < this.rateLimitMs || waitedClient < this.rateLimitMs) {
      const remainingIp = waitedIp === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : this.rateLimitMs - waitedIp;
      const remainingClient =
        waitedClient === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : this.rateLimitMs - waitedClient;
      const retryAfterMs = Math.max(0, Math.min(remainingIp, remainingClient));
      return { status: 'rate_limited', retryAfterMs };
    }
    if (this.queue.length >= this.queueCap) {
      return { status: 'cola_llena', cap: this.queueCap };
    }

    this.lastByIp.set(input.ip, now);
    this.lastByClient.set(input.clientId, now);
    this.queue.push({ kind: input.kind, word: input.word, ip: input.ip, clientId: input.clientId, at: now });
    return { status: 'encolado', queueSize: this.queue.length };
  }

  /** Saca el gesto más antiguo (el tick aplica como máximo 1 por paso). */
  drain(): QueuedGesture | undefined {
    return this.queue.shift();
  }

  /** Mira el siguiente sin sacarlo (el tick lo retiene si el mundo aún no lo acepta). */
  peek(): QueuedGesture | undefined {
    return this.queue[0];
  }

  /** Vacia la cola (cierre/pruebas). */
  clear(): void {
    this.queue.length = 0;
  }
}
