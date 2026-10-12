/**
 * D2 — tests del puerto de depuración `BrainV05Adapter.getDebugState()`:
 * forma de `BrainDebugState`, coherencia con el último think(), arrays del
 * placeholder y comportamiento sin think() previo (no lanza).
 */
import { describe, expect, it } from 'vitest';
import { BrainV05Adapter } from '../src/brain/adapter';
import { PlaceholderBrain } from '../src/brain/placeholder-brain';
import type { BrainDebugState, BrainV05Like, BrainV05Result } from '../src/brain/brainv05-types';
import type { BrainInputs } from '../src/contracts/ibrain';
import { FakeBrain } from './fake-brain';

const INPUTS: BrainInputs = { drives: {}, chemicals: {}, tick: 0 };

/** Forma completa de BrainDebugState: todos los campos, tipos correctos. */
function expectDebugShape(state: BrainDebugState): void {
  expect(Object.keys(state).sort()).toEqual([
    'action',
    'actionName',
    'confidence',
    'explored',
    'genomeInputs',
    'hasThink',
    'hiddenActivations',
    'outputWeights',
  ]);
  expect(typeof state.action).toBe('number');
  expect(typeof state.actionName).toBe('string');
  expect(typeof state.confidence).toBe('number');
  expect(typeof state.explored).toBe('boolean');
  expect(typeof state.hasThink).toBe('boolean');
  expect(Array.isArray(state.hiddenActivations)).toBe(true);
  expect(Array.isArray(state.outputWeights)).toBe(true);
  expect(Array.isArray(state.genomeInputs)).toBe(true);
  expect(state.hiddenActivations.every((n) => typeof n === 'number')).toBe(true);
  expect(state.outputWeights.every((n) => typeof n === 'number')).toBe(true);
  expect(state.genomeInputs.every((n) => typeof n === 'number')).toBe(true);
}

describe('adaptador — getDebugState (puerto D2)', () => {
  it('tras think(): forma completa + acción/confianza/explored coherentes con la salida', () => {
    const fake = new FakeBrain();
    fake.next = { action: 0.75, actionName: 'comer', confidence: 0.9, explored: true };
    const adapter = new BrainV05Adapter(fake, {
      mapGenome: () => [0.1, 0.2, 0.3, 0.4],
    });

    adapter.think(INPUTS);
    const state = adapter.getDebugState();

    expectDebugShape(state);
    expect(state.hasThink).toBe(true);
    expect(state.action).toBe(0.75);
    expect(state.actionName).toBe('comer');
    expect(state.confidence).toBe(0.9);
    expect(state.explored).toBe(true);
    // El adaptador aporta el vector genómico que realmente envió.
    expect(state.genomeInputs).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('confianza recortada a 0..1 y explored normalizado a boolean', () => {
    const fake = new FakeBrain();
    fake.next = { action: -0.5, actionName: 'x', confidence: 7, explored: false };
    const adapter = new BrainV05Adapter(fake);

    adapter.think(INPUTS);
    const state = adapter.getDebugState();

    expect(state.confidence).toBe(1);
    expect(state.explored).toBe(false);
    expect(state.action).toBe(-0.5);
  });

  it('sin think() previo devuelve un estado coherente y NO lanza', () => {
    const adapter = new BrainV05Adapter(new FakeBrain());

    let state: BrainDebugState | undefined;
    expect(() => {
      state = adapter.getDebugState();
    }).not.toThrow();

    expectDebugShape(state!);
    expect(state!.hasThink).toBe(false);
    expect(state!.action).toBe(0);
    expect(state!.actionName).toBe('sin-think');
    expect(state!.confidence).toBe(0);
    expect(state!.explored).toBe(false);
    expect(state!.genomeInputs).toEqual([]);
    // Sin MLP real: arrays vacíos documentados, no inventados.
    expect(state!.hiddenActivations).toEqual([]);
    expect(state!.outputWeights).toEqual([]);
  });

  it('si el cerebro subyacente NO implementa getDebugState, arrays vacíos pero acción real', () => {
    // FakeBrain no implementa getDebugState → rama placeholder del adaptador.
    const fake = new FakeBrain();
    fake.next = { action: 0.4, actionName: 'jugar', confidence: 0.6, explored: true };
    const adapter = new BrainV05Adapter(fake);

    adapter.think(INPUTS);
    const state = adapter.getDebugState();

    expect(state.action).toBe(0.4);
    expect(state.actionName).toBe('jugar');
    expect(state.confidence).toBe(0.6);
    expect(state.explored).toBe(true);
    expect(state.hiddenActivations).toEqual([]);
    expect(state.outputWeights).toEqual([]);
    expect(state.genomeInputs).toEqual([0, 0, 0, 0]); // fallback documentado
  });

  it('si el cerebro subyacente SÍ implementa getDebugState, reutiliza sus arrays', () => {
    class DebugBrain implements BrainV05Like {
      think(_input: unknown): BrainV05Result {
        return { action: 1, actionName: 'correr', confidence: 0.5, explored: false };
      }
      reinforce(): void {}
      getDebugState(): BrainDebugState {
        return {
          action: 1,
          actionName: 'correr',
          confidence: 0.5,
          explored: false,
          hasThink: true,
          hiddenActivations: [0.2, 0.8, -1],
          outputWeights: [0.1, 0.2, 0.3, 0.4],
          genomeInputs: [],
        };
      }
      serialize(): string {
        return '{}';
      }
      deserialize(): void {}
      dispose(): void {}
    }

    const adapter = new BrainV05Adapter(new DebugBrain());
    adapter.think(INPUTS);
    const state = adapter.getDebugState();

    expect(state.hiddenActivations).toEqual([0.2, 0.8, -1]);
    expect(state.outputWeights).toEqual([0.1, 0.2, 0.3, 0.4]);
    // La acción/confianza siguen siendo las del adaptador (último think real).
    expect(state.action).toBe(1);
    expect(state.actionName).toBe('correr');
  });

  it('PlaceholderBrain.getDebugState devuelve la forma placeholder sin lanzar', () => {
    const state = new PlaceholderBrain().getDebugState();

    expectDebugShape(state);
    expect(state.action).toBe(0);
    expect(state.confidence).toBe(0);
    expect(state.explored).toBe(false);
    expect(state.hasThink).toBe(false);
    // No hay MLP real: arrays vacíos (documentado), nunca valores inventados.
    expect(state.hiddenActivations).toEqual([]);
    expect(state.outputWeights).toEqual([]);
    expect(state.genomeInputs).toEqual([]);
  });

  it('el estado refleja el ÚLTIMO think() si hay varios', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);

    fake.next = { action: 1, actionName: 'a', confidence: 0.1, explored: false };
    adapter.think(INPUTS);
    fake.next = { action: -1, actionName: 'b', confidence: 0.9, explored: true };
    adapter.think(INPUTS);

    const state = adapter.getDebugState();
    expect(state.action).toBe(-1);
    expect(state.actionName).toBe('b');
    expect(state.explored).toBe(true);
  });
});
