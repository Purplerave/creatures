/**
 * ⚠️ Cerebro PLACEHOLDER TEMPORAL — se reemplaza en un solo fichero cuando
 * suba la rama `tecnotron/brain-v05` de la CEO con la clase real.
 *
 * NO es un cerebro: no hay MLP, ni pesos, ni exploración ε. Implementa
 * `BrainV05Like` con una salida neutra constante para que el adaptador,
 * main.ts y los tests compilen y funcionen contra el mismo shape.
 * No copiar ni inventar el MLP aquí (regla del cerebro encapsulado).
 */
import type { BrainV05Input, BrainV05Like, BrainV05Result } from './brainv05-types';

export class PlaceholderBrain implements BrainV05Like {
  think(_input: BrainV05Input): BrainV05Result {
    return { action: 0, actionName: 'placeholder', confidence: 0, explored: false };
  }

  reinforce(_action: number, _reward: number): void {
    // Sin estado que reforzar: no-op.
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
