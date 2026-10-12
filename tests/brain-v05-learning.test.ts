/**
 * Cerebro v0.5 REAL — aprendizaje.
 * Hebbiano modulado por recompensa: premio ⇒ sube la puntuación de la acción
 * reforzada, castigo ⇒ baja. Incluye el A/B del hito de Fase 3 (con el
 * aprendizaje desactivado no aparece la preferencia) y la reversibilidad.
 */
import { describe, expect, it } from 'vitest';
import { BrainV05 } from '../src/brain/brain-v05';
import type { BrainV05Input } from '../src/brain/brainv05-types';
import { DEFAULT_ACTIONS } from '../src/brain/actions';

const VECTOR: BrainV05Input = {
  drives: [0.8, 0.4, 0.2, 0.6, 0.5, 0.3, 0.1, 0.7],
  stimuli: [0.5, 0.2, 0.3],
  genome: [0.5, 0.5, 0.5, 0.5],
};

const TARGET = DEFAULT_ACTIONS[3]; // «explorar», código +0.5
const index = (value: number): number => DEFAULT_ACTIONS.findIndex((action) => action.value === value);

describe('cerebro v0.5 — refuerzo Hebbiano', () => {
  it('un premio sube la puntuación de la acción reforzada', () => {
    const brain = new BrainV05({ hiddenSize: 8, learningRate: 0.1, epsilonInitial: 0, seed: 21 });
    const before = brain.think(VECTOR);
    const scoresBefore = brain.getDebugState().scores;
    brain.reinforce(before.action, 1);
    brain.think(VECTOR);
    const scoresAfter = brain.getDebugState().scores;
    expect(scoresAfter[index(before.action)]).toBeGreaterThan(scoresBefore[index(before.action)]);
    expect(brain.getDebugState().reinforces).toBe(1);
    expect(brain.getDebugState().lastReward).toBe(1);
  });

  it('un castigo baja la puntuación de la acción reforzada', () => {
    const brain = new BrainV05({ hiddenSize: 8, learningRate: 0.1, epsilonInitial: 0, seed: 21 });
    const before = brain.think(VECTOR);
    const scoresBefore = brain.getDebugState().scores;
    brain.reinforce(before.action, -1);
    brain.think(VECTOR);
    const scoresAfter = brain.getDebugState().scores;
    expect(scoresAfter[index(before.action)]).toBeLessThan(scoresBefore[index(before.action)]);
    expect(brain.getDebugState().lastReward).toBe(-1);
  });

  it('la recompensa se recorta a [-1, 1] (mismo efecto con +1 que con +50)', () => {
    const a = new BrainV05({ hiddenSize: 6, learningRate: 0.1, epsilonInitial: 0, seed: 3 });
    const b = new BrainV05({ hiddenSize: 6, learningRate: 0.1, epsilonInitial: 0, seed: 3 });
    a.think(VECTOR);
    b.think(VECTOR);
    a.reinforce(TARGET.value, 1);
    b.reinforce(TARGET.value, 50);
    expect(a.serialize()).toBe(b.serialize());
    expect(a.getDebugState().lastReward).toBe(1);
  });

  it('reward 0 no mueve los pesos pero cuenta como refuerzo', () => {
    const brain = new BrainV05({ hiddenSize: 6, learningRate: 0.2, epsilonInitial: 0, seed: 3 });
    brain.think(VECTOR);
    const before = brain.getDebugState();
    brain.reinforce(TARGET.value, 0);
    const after = brain.getDebugState();
    expect(after.weightNorm).toBe(before.weightNorm);
    expect(after.scores).toEqual(before.scores);
    expect(after.reinforces).toBe(1);
  });

  it('permite reforzar una acción distinta de la elegida (misma traza sensorial)', () => {
    const brain = new BrainV05({ hiddenSize: 8, learningRate: 0.1, epsilonInitial: 0, seed: 21 });
    const decision = brain.think(VECTOR);
    const other = DEFAULT_ACTIONS.find((action) => action.value !== decision.action);
    expect(other).toBeDefined();
    const scoresBefore = brain.getDebugState().scores;
    brain.reinforce(other!.value, 1);
    brain.think(VECTOR);
    expect(brain.getDebugState().scores[index(other!.value)]).toBeGreaterThan(scoresBefore[index(other!.value)]);
  });

  it('acumula el historial de recompensa (rewardTotal)', () => {
    const brain = new BrainV05({ epsilonInitial: 0, seed: 1 });
    brain.think(VECTOR);
    brain.reinforce(TARGET.value, 1);
    brain.reinforce(TARGET.value, -0.25);
    expect(brain.getDebugState().rewardTotal).toBeCloseTo(0.75, 12);
  });

  it('los pesos nunca salen del recorte ±maxWeight', () => {
    const brain = new BrainV05({ hiddenSize: 12, learningRate: 0.3, epsilonInitial: 0, maxWeight: 2, seed: 4 });
    for (let i = 0; i < 400; i++) {
      brain.think(VECTOR);
      brain.reinforce(TARGET.value, 1);
    }
    expect(brain.getDebugState().weightAbsMax).toBeLessThanOrEqual(2);
  });

  it('lanza RangeError con código de acción desconocido o recompensa no finita', () => {
    const brain = new BrainV05({ epsilonInitial: 0, seed: 1 });
    brain.think(VECTOR);
    expect(() => brain.reinforce(0.77, 1)).toThrow(RangeError);
    expect(() => brain.reinforce(TARGET.value, Number.NaN)).toThrow(RangeError);
  });
});

describe('cerebro v0.5 — aprendizaje de una preferencia (A/B)', () => {
  const config = { hiddenSize: 12, learningRate: 0.155, epsilonInitial: 0.35, epsilonDecay: 0.999, seed: 7 };

  function run(rewardOf: (actionValue: number) => number, steps = 500): BrainV05 {
    const brain = new BrainV05(config);
    for (let i = 0; i < steps; i++) {
      const result = brain.think(VECTOR);
      brain.reinforce(result.action, rewardOf(result.action));
    }
    brain.think(VECTOR);
    return brain;
  }

  it('aprende a preferir la acción premiada y lo hace visible en la confianza', () => {
    const trained = run((value) => (value === TARGET.value ? 1 : -1));
    const debug = trained.getDebugState();
    const greedy = debug.scores.indexOf(Math.max(...debug.scores));
    expect(DEFAULT_ACTIONS[greedy]?.id).toBe(TARGET.id);
    expect(debug.probabilities[index(TARGET.value)]).toBeGreaterThan(0.5);
    expect(debug.probabilities[index(TARGET.value)]).toBeGreaterThan(Math.max(...debug.probabilities.filter((_, i) => i !== index(TARGET.value))));
  });

  it('A/B: con el aprendizaje desactivado (reward 0) no aparece la preferencia', () => {
    const trained = run((value) => (value === TARGET.value ? 1 : -1));
    const control = run(() => 0);
    const trainedProbability = trained.getDebugState().probabilities[index(TARGET.value)];
    const controlProbability = control.getDebugState().probabilities[index(TARGET.value)];
    expect(trainedProbability).toBeGreaterThan(controlProbability + 0.2);
    // Sin refuerzo la red no cambia: sus pesos siguen siendo los de nacimiento.
    expect(control.getDebugState().weightNorm).toBe(new BrainV05(config).getDebugState().weightNorm);
    expect(control.getDebugState().reinforces).toBe(500);
    expect(control.getDebugState().rewardTotal).toBe(0);
  });

  it('aprende la acción contraria si el premio cambia de signo', () => {
    const other = DEFAULT_ACTIONS[0]; // «descansar», código -1
    const first = run((value) => (value === TARGET.value ? 1 : -1), 300);
    expect(first.getDebugState().scores.indexOf(Math.max(...first.getDebugState().scores))).toBe(index(TARGET.value));

    // Misma red, premio invertido: debe acabar prefiriendo la otra acción.
    const flipped = new BrainV05(config);
    flipped.deserialize(first.serialize());
    for (let i = 0; i < 400; i++) {
      const result = flipped.think(VECTOR);
      flipped.reinforce(result.action, result.action === other.value ? 1 : -1);
    }
    flipped.think(VECTOR);
    const debug = flipped.getDebugState();
    expect(DEFAULT_ACTIONS[debug.scores.indexOf(Math.max(...debug.scores))]?.id).toBe(other.id);
  });
});

describe('cerebro v0.5 — exploración ε', () => {
  it('ε decae por decisión y se detiene en el suelo', () => {
    const brain = new BrainV05({ epsilonInitial: 0.5, epsilonDecay: 0.5, epsilonFloor: 0.05, seed: 1 });
    expect(brain.getDebugState().epsilon).toBe(0.5);
    brain.think(VECTOR);
    expect(brain.getDebugState().epsilon).toBeCloseTo(0.25, 12);
    brain.think(VECTOR);
    expect(brain.getDebugState().epsilon).toBeCloseTo(0.125, 12);
    for (let i = 0; i < 10; i++) brain.think(VECTOR);
    expect(brain.getDebugState().epsilon).toBe(0.05);
  });

  it('nunca baja del suelo 5 % por muchas decisiones que tome', () => {
    const brain = new BrainV05({ epsilonInitial: 0.6, epsilonDecay: 0.9, seed: 1 });
    for (let i = 0; i < 500; i++) brain.think(VECTOR);
    expect(brain.getDebugState().epsilon).toBeGreaterThanOrEqual(0.05);
    expect(brain.getDebugState().epsilon).toBe(0.05);
  });

  it('con ε = 1 todas las decisiones son exploración; con ε = 0 ninguna', () => {
    const explorer = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 6 });
    for (let i = 0; i < 50; i++) expect(explorer.think(VECTOR).explored).toBe(true);

    const greedy = new BrainV05({ epsilonInitial: 0, epsilonDecay: 1, seed: 6 });
    for (let i = 0; i < 50; i++) expect(greedy.think(VECTOR).explored).toBe(false);
  });

  it('explora de hecho más de una acción distinta cuando ε es alto', () => {
    const brain = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 15 });
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(brain.think(VECTOR).action);
    expect(seen.size).toBeGreaterThan(1);
  });
});
