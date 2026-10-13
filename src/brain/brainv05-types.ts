/**
 * Tipos estructurales mínimos del modelo cerebral v0.5.
 *
 * REGLA DEL CEREBRO ENVOLVENTE Y DESECHABLE: este módulo NO conoce el MLP,
 * sus capas ni sus pesos. Declara solo la superficie de llamada que el
 * adaptador (`src/brain/adapter.ts`) necesita, de forma ESTRUCTURAL: cualquier
 * clase con estos métodos y shapes encaja sin `implements` (TS structural
 * typing).
 *
 * `BrainV05` (`src/brain/brain-v05.ts`) implementa esta superficie en la app;
 * `src/brain/placeholder-brain.ts` se conserva como doble para tests/regresión.
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
  /** Nombre legible de la acción (p. ej. «buscar»). */
  actionName: string;
  /** Confianza de la decisión, 0..1. */
  confidence: number;
  /** true si la acción salió de la exploración ε, no del argmax. */
  explored: boolean;
}

/**
 * Estado normalizado de depuración del cerebro (D2). Puede consumirse desde
 * una vista de debug; el repo actual tiene el panel de actividad en `main.ts`,
 * pero aún no incluye un módulo de visualización L2 independiente.
 *
 * ⚠️ EXCEPCIÓN AUTORIZADA Y ACOTADA a la regla del cerebro encapsulado: la
 * CEO pidió exponer estos campos concretos para la vista de depuración. Es
 * un puerto de debug explícito, NO una apertura del MLP: no expone capas,
 * arquitectura ni ε; solo lo listado abajo. Añadir más campos requiere nueva
 * autorización.
 *
 * El puerto D2 del adaptador conserva este shape compatible. `BrainV05` sí es
 * un MLP real, pero su interfaz estructural de debug usa scores/probabilidades
 * (`BrainV05DebugState`); el adaptador deja `hiddenActivations` y `outputWeights`
 * vacíos porque no debe filtrar esos internals.
 */
export interface BrainDebugState {
  /** Acción elegida en el último `think()`; 0 si aún no ha habido ninguno. */
  action: number;
  /** Nombre legible de la última acción; `'sin-think'` si aún no ha habido. */
  actionName: string;
  /** Confianza 0..1 de la última decisión; 0 si aún no ha habido `think()`. */
  confidence: number;
  /** true si la última acción salió de la exploración ε (no del argmax). */
  explored: boolean;
  /** true si ya hubo al menos un `think()`; si es false el resto es neutro. */
  hasThink: boolean;
  /**
   * Activaciones de la capa oculta, en orden de neurona.
   * `[]` = el adaptador no filtra internals del MLP (ver cabecera y §Debug).
   */
  hiddenActivations: number[];
  /**
   * Pesos de la capa de salida (plano, fila a fila).
   * `[]` = el adaptador no filtra internals del MLP (ver cabecera y §Debug).
   */
  outputWeights: number[];
  /**
   * Los 4 genes realmente enviados como `input.genome` en el último
   * `think()` (0..1); `[]` = aún no se ha pensado. Lo aporta el adaptador,
   * que es quien construye el vector.
   */
  genomeInputs: number[];
}

/**
 * Formas crudas conocidas del puerto `getDebugState?()`: la del adaptador
 * (`BrainDebugState`), la del MLP real (`BrainV05DebugState` en
 * `brain-v05.ts`: scores/probabilities/lastDecision/…) o la placeholder.
 * La interfaz declara `unknown` a propósito — TypeScript rechaza uniones de
 * solo-opcionales sin propiedades en común (weak types, TS2559) — y el
 * adaptador normaliza con `toNumberArray` (valida en runtime, nunca inventa).
 */
export type RawDebugShape = unknown;

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
  /**
   * Puerto de depuración OPCIONAL (D2, excepción autorizada — ver
   * `BrainDebugState`). Forma cruda (`RawDebugShape`): el adaptador lo
   * llama solo si existe y normaliza con `toNumberArray`; sin él → forma
   * placeholder documentada.
   */
  getDebugState?(): RawDebugShape;
  /** Serializa el estado del cerebro (pesos, ε, etc.) a string. */
  serialize(...args: unknown[]): unknown;
  /** Restaura el estado serializado. */
  deserialize(...args: unknown[]): unknown;
  /** Libera recursos (típico al reciclar el cerebro). */
  dispose(): void;
}
