/**
 * Contrato del cerebro.
 * `BrainV05Adapter` lo implementa y encapsula una implementación enchufable;
 * la composición actual usa `PlaceholderBrain` hasta disponer del modelo real.
 * La bioquímica no conoce el algoritmo concreto.
 */
import type { ChemicalId, DriveId, DriveState } from './types';

/** Entradas que el cerebro observa en cada tick. */
export interface BrainInputs {
  /** Todos los drives, por id. */
  drives: Record<DriveId, DriveState>;
  /** Todos los químicos, por id. */
  chemicals: Record<ChemicalId, number>;
  /** Índice de tick (0, 1, 2, …) para secuencias/temporización. */
  tick: number;
}

/** Salida del cerebro: decisiones en crudo, interpretadas por quien las consume. */
export interface BrainOutput {
  /**
   * Vector de acciones en [-1, 1]. El significado de cada índice lo define el
   * módulo que implementa la interfaz (movimiento, emisión de señales, …).
   */
  actions: number[];
  /** Métricas de depuración opcionales (activaciones, ε actual, …). */
  debug?: Record<string, number>;
}

/** Contrato mínimo que implementa `BrainV05Adapter` en `src/brain/adapter.ts`. */
export interface IBrain {
  think(inputs: BrainInputs): BrainOutput;
}
