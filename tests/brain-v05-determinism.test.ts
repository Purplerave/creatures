/**
 * Cerebro v0.5 REAL — determinismo.
 * Regla de proyecto: nada de `Math.random()`; misma semilla + mismas entradas
 * + mismos refuerzos ⇒ mismas decisiones bit a bit.
 */
import { describe, expect, it, vi } from 'vitest';
import { BrainV05 } from '../src/brain/brain-v05';
import type { BrainV05Input } from '../src/brain/brainv05-types';
import { DEFAULT_ACTIONS } from '../src/brain/actions';

function sequence(count: number): BrainV05Input[] {
  const out: BrainV05Input[] = [];
  for (let i = 0; i < count; i++) {
    const phase = i / count;
    out.push({
      drives: [0.2 + 0.6 * phase, 0.7 - 0.4 * phase, 0.1 + phase, 0.5, 0.4, 0.3, 0.2, 0.6 - 0.3 * phase],
      stimuli: [0.3 + 0.4 * phase, 0.1, 0.2 + 0.2 * phase],
      genome: [0.5, 0.5, 0.5, 0.5],
    });
  }
  return out;
}

function play(brain: BrainV05, inputs: BrainV05Input[]): string[] {
  return inputs.map((vector) => {
    const result = brain.think(vector);
    // Refuerzo dependiente de la entrada: ejercita también la ruta de aprendizaje.
    brain.reinforce(result.action, vector.drives[0] > 0.5 ? 0.6 : -0.4);
    return `${result.action}|${result.explored ? 1 : 0}|${result.confidence.toFixed(12)}`;
  });
}

describe('cerebro v0.5 — determinismo', () => {
  it('misma semilla ⇒ misma secuencia de decisiones y refuerzos', () => {
    const inputs = sequence(240);
    const a = play(new BrainV05({ hiddenSize: 16, learningRate: 0.1, epsilonInitial: 0.5, epsilonDecay: 0.999, seed: 42 }), inputs);
    const b = play(new BrainV05({ hiddenSize: 16, learningRate: 0.1, epsilonInitial: 0.5, epsilonDecay: 0.999, seed: 42 }), inputs);
    expect(a).toEqual(b);
  });

  it('la exploración forzada (ε = 1) sigue siendo reproducible con la semilla', () => {
    const inputs = sequence(120);
    const a = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 7 });
    const b = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 7 });
    expect(inputs.map((v) => a.think(v).action)).toEqual(inputs.map((v) => b.think(v).action));
    expect(a.getDebugState().thinks).toBe(120);
  });

  it('otra semilla ⇒ otros pesos iniciales (serialización distinta)', () => {
    const a = new BrainV05({ seed: 1 });
    const b = new BrainV05({ seed: 2 });
    expect(a.serialize()).not.toBe(b.serialize());
  });

  it('dos instancias con la misma semilla nacen con pesos idénticos', () => {
    expect(new BrainV05({ seed: 123 }).serialize()).toBe(new BrainV05({ seed: 123 }).serialize());
  });

  it('no llama nunca a Math.random()', () => {
    const spy = vi.spyOn(Math, 'random');
    const brain = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 99 });
    for (const vector of sequence(60)) {
      const result = brain.think(vector);
      brain.reinforce(result.action, 0.5);
    }
    brain.serialize();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('el orden de las extracciones del PRNG queda registrado (draws)', () => {
    // Al nacer ya se han consumido las extracciones de la inicialización de
    // pesos: hiddenSize × 15 (entrada→oculta) + acciones × hiddenSize.
    const brain = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 99 });
    const atBirth = brain.getDebugState().draws;
    expect(atBirth).toBe(12 * 15 + DEFAULT_ACTIONS.length * 12);
    brain.think(sequence(1)[0]);
    // Con ε = 1 cada decisión gasta 2 extracciones (sorteo + acción aleatoria).
    expect(brain.getDebugState().draws).toBe(atBirth + 2);
    brain.think(sequence(1)[0]);
    expect(brain.getDebugState().draws).toBe(atBirth + 4);
  });

  it('reinforce sin think previo no consume azar ni altera los pesos', () => {
    const brain = new BrainV05({ seed: 5 });
    const before = brain.getDebugState();
    brain.reinforce(0, 1);
    const after = brain.getDebugState();
    expect(after.draws).toBe(before.draws);
    expect(after.weightNorm).toBe(before.weightNorm);
    expect(after.reinforces).toBe(0);
  });
});
