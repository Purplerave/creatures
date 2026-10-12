/**
 * Fake de cerebro brain-v05 para tests del adaptador.
 * Registra cada `think()` y `reinforce()` para poder asertar las llamadas.
 * No es un MLP: solo captura entradas/salidas (regla del cerebro desechable).
 */
import type { BrainV05Input, BrainV05Like, BrainV05Result } from '../src/brain/brainv05-types';

export class FakeBrain implements BrainV05Like {
  /** Copias de los vectores recibidos, en orden de llamada. */
  readonly thinkCalls: BrainV05Input[] = [];
  /** Pares (acción, recompensa) recibidos por reinforce(). */
  readonly reinforceCalls: { action: number; reward: number }[] = [];
  /** Respuesta devuelta en la próxima llamada a think(). */
  next: BrainV05Result = { action: 0, actionName: 'neutro', confidence: 0, explored: false };

  think(input: BrainV05Input): BrainV05Result {
    this.thinkCalls.push({
      drives: [...input.drives],
      stimuli: [...input.stimuli],
      genome: [...input.genome],
    });
    return this.next;
  }

  reinforce(action: number, reward: number): void {
    this.reinforceCalls.push({ action, reward });
  }

  serialize(): string {
    return JSON.stringify({ fake: true });
  }

  deserialize(_raw: string): void {
    // Sin estado que restaurar.
  }

  dispose(): void {
    // Nada que liberar.
  }
}
