/**
 * Tipos estructurales mínimos del modelo cerebral v0.5.
 *
 * REGLA DEL CEREBRO ENVOLVENTE Y DESECHABLE: este módulo NO conoce el MLP,
 * sus capas ni sus pesos. Declara solo la superficie de llamada que el
 * adaptador (`src/brain/adapter.ts`) necesita, de forma ESTRUCTURAL: cualquier
 * clase con estos métodos y shapes encaja sin `implements` (TS structural
 * typing).
 *
 * Mientras no haya una implementación real conectada, se usa
 * `src/brain/placeholder-brain.ts`, que satisface esta misma interfaz.
 */

/** Entrada que espera `brain-v05`: tres vectores ya normalizados. */
export interface BrainV05Input {
  /** Niveles de los 8 drives, en orden fijo, 0..1. */
  drives: number[];
  /** 3 estímulos derivados de los químicos, 0..1 (mapeo provisional). */
  stimuli: number[];
  /** 4 genes del genoma, 0..1 (mapeo provisional). */
  genome: number[];
}

/** Salida de `brain-v05.think()`. */
export interface BrainV05Result {
  /** Acción elegida (escalar crudo; ver mapeo en src/brain/adapter.ts). */
  action: number;
  /** Nombre legible de la acción (p. ej. «comer»). */
  actionName: string;
  /** Confianza de la decisión, 0..1. */
  confidence: number;
  /** true si la acción salió de la exploración ε, no delargmax. */
  explored: boolean;
}

/**
 * Superficie pública mínima del cerebro brain-v05 que usa el adaptador.
 * (`think` y `reinforce` son los que se llaman; `serialize`/`deserialize`/
 * `dispose` se declaran porque forman parte del contrato público del cerebro
 * y así el placeholder y los fakes de test cumplen el mismo shape.)
 */
export interface BrainV05Like {
  /** Una pasada de decisión sobre el vector ya normalizado. */
  think(input: BrainV05Input): BrainV05Result;
  /** Refuerzo de la acción `action` con recompensa `reward` en [-1, 1]. */
  reinforce(action: number, reward: number): void;
  /** Serializa el estado del cerebro (pesos, ε, etc.) a string. */
  serialize(...args: unknown[]): unknown;
  /** Restaura el estado serializado. */
  deserialize(...args: unknown[]): unknown;
  /** Libera recursos (típico al reciclar el cerebro). */
  dispose(): void;
}
