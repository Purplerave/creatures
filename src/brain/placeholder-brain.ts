/**
 * Implementación neutra de prueba/regresión; la app usa `BrainV05` real.
 *
 * NO es un cerebro: no hay MLP, pesos ni exploración ε. Su salida constante
 * permite probar el adaptador/fábrica sin acoplarlos al modelo productivo.
 * No copiar ni inventar el MLP aquí (regla del cerebro encapsulado).
 */
import type { BrainDebugState, BrainV05Input, BrainV05Like, BrainV05Result } from './brainv05-types';

export class PlaceholderBrain implements BrainV05Like {
  think(_input: BrainV05Input): BrainV05Result {
    return { action: 0, actionName: 'placeholder', confidence: 0, explored: false };
  }

  reinforce(_action: number, _reward: number): void {
    // Sin estado que reforzar: no-op.
  }

  /**
   * Puerto de depuración D2. NO hay MLP real, así que no hay activaciones
   * ni pesos que mostrar: se devuelven los arrays VACÍOS documentados en
   * `BrainDebugState` (no se inventan valores). El adaptador rellena
   * acción/confianza/explored/genomeInputs con su último `think()`.
   */
  getDebugState(): BrainDebugState {
    return {
      action: 0,
      actionName: 'placeholder',
      confidence: 0,
      explored: false,
      hasThink: false,
      hiddenActivations: [],
      outputWeights: [],
      genomeInputs: [],
    };
  }

  serialize(): string {
    return JSON.stringify({ placeholder: true });
  }

  deserialize(_raw: string): void {
    // No hay estado que restaurar.
  }

  dispose(): void {
    // Nada que liberar.
  }
}
