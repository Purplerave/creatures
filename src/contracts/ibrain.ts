/**
 * Contrato del cerebro.
 * Lo implementa Tecnotron (MLP + exploración ε). Esta interfaz es el único
 * acoplamiento: la bioquímica no sabe qué algoritmo usa el cerebro.
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

/**
 * Contrato mínimo del cerebro.
 * Implementación desechable esperada en src/brain/ (stub en src/brain/stub.ts).
 */
export interface IBrain {
  think(inputs: BrainInputs): BrainOutput;
}
