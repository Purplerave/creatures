/**
 * Cerebro v0.5 REAL — serialización y ciclo de vida.
 * `serialize()` estable, `deserialize()` validado y reproducible (incluido el
 * azar: misma semilla + mismo nº de extracciones), `dispose()` irreversible.
 */
import { describe, expect, it } from 'vitest';
import { BRAIN_V05_SCHEMA_VERSION, BrainV05 } from '../src/brain/brain-v05';
import type { BrainV05Input } from '../src/brain/brainv05-types';

const VECTOR: BrainV05Input = {
  drives: [0.8, 0.4, 0.2, 0.6, 0.5, 0.3, 0.1, 0.7],
  stimuli: [0.5, 0.2, 0.3],
  genome: [0.5, 0.5, 0.5, 0.5],
};

const CONFIG = { hiddenSize: 9, learningRate: 0.12, epsilonInitial: 0.4, epsilonDecay: 0.995, seed: 77 };

function live(steps = 40): BrainV05 {
  const brain = new BrainV05(CONFIG);
  for (let i = 0; i < steps; i++) {
    const result = brain.think(VECTOR);
    brain.reinforce(result.action, i % 3 === 0 ? 0.8 : -0.2);
  }
  return brain;
}

describe('cerebro v0.5 — serialize', () => {
  it('es estable: mismo estado ⇒ mismo string (y clave de esquema presente)', () => {
    const a = live();
    const b = live();
    expect(a.serialize()).toBe(b.serialize());
    const payload = JSON.parse(a.serialize()) as Record<string, unknown>;
    expect(payload.schemaVersion).toBe(BRAIN_V05_SCHEMA_VERSION);
    expect(Object.keys(payload).sort()).toEqual(['actions', 'config', 'schemaVersion', 'state', 'weights']);
  });

  it('guarda la forma de la red (hiddenSize × 15 y acciones × hiddenSize)', () => {
    const weights = JSON.parse(live().serialize()).weights as Record<string, number[]>;
    expect(weights.inputHidden).toHaveLength(9 * 15);
    expect(weights.hiddenBias).toHaveLength(9);
    expect(weights.hiddenAction).toHaveLength(5 * 9);
    expect(weights.actionBias).toHaveLength(5);
  });

  it('refleja el aprendizaje: dos historiales distintos no serializan igual', () => {
    const rewarded = live(20);
    const punished = new BrainV05(CONFIG);
    for (let i = 0; i < 20; i++) {
      const result = punished.think(VECTOR);
      punished.reinforce(result.action, -1);
    }
    expect(rewarded.serialize()).not.toBe(punished.serialize());
  });
});

describe('cerebro v0.5 — deserialize', () => {
  it('restaura el estado exacto: el serializado vuelve a ser idéntico', () => {
    const source = live(60);
    const restored = new BrainV05(CONFIG);
    restored.deserialize(source.serialize());
    expect(restored.serialize()).toBe(source.serialize());
  });

  it('reproduce el azar: tras cargar, las decisiones siguientes coinciden', () => {
    const source = live(60);
    const restored = new BrainV05(CONFIG);
    restored.deserialize(source.serialize());
    const expected: string[] = [];
    const actual: string[] = [];
    for (let i = 0; i < 80; i++) {
      const a = source.think(VECTOR);
      const b = restored.think(VECTOR);
      expected.push(`${a.action}|${a.explored ? 1 : 0}|${a.confidence}`);
      actual.push(`${b.action}|${b.explored ? 1 : 0}|${b.confidence}`);
      source.reinforce(a.action, 0.5);
      restored.reinforce(b.action, 0.5);
    }
    expect(actual).toEqual(expected);
    expect(restored.serialize()).toBe(source.serialize());
  });

  it('carga sobre una instancia con otra configuración compatible (mismo hiddenSize)', () => {
    const source = live(10);
    const other = new BrainV05({ ...CONFIG, learningRate: 0.01, epsilonInitial: 1 });
    other.deserialize(source.serialize());
    // La config restaurada gana sobre la de construcción.
    expect(other.getConfig().learningRate).toBe(CONFIG.learningRate);
    expect(other.getDebugState().epsilon).toBe(source.getDebugState().epsilon);
  });

  it('rechaza un hiddenSize o un espacio de acciones incompatibles', () => {
    const raw = live(5).serialize();
    expect(() => new BrainV05({ ...CONFIG, hiddenSize: 10 }).deserialize(raw)).toThrow(RangeError);
    const twoActions = new BrainV05({
      ...CONFIG,
      actions: [
        { id: 'a', name: 'A', value: -1 },
        { id: 'b', name: 'B', value: 1 },
      ],
    });
    expect(() => twoActions.deserialize(raw)).toThrow(RangeError);
  });

  it.each([
    ['no es un string', 42 as never],
    ['no es JSON', 'esto no es json'],
    ['no es un objeto', '[1,2,3]'],
    ['falta todo', '{}'],
    ['schemaVersion ajena', JSON.stringify({ ...JSON.parse(live(2).serialize()), schemaVersion: 99 })],
    ['state inválido', JSON.stringify({ ...JSON.parse(live(2).serialize()), state: null })],
    ['contador negativo', JSON.stringify({
      ...JSON.parse(live(2).serialize()),
      state: { ...JSON.parse(live(2).serialize()).state, thinks: -3 },
    })],
    ['weights ausentes', JSON.stringify({ ...JSON.parse(live(2).serialize()), weights: null })],
    ['matriz corta', JSON.stringify({
      ...JSON.parse(live(2).serialize()),
      weights: { ...JSON.parse(live(2).serialize()).weights, inputHidden: [0.1, 0.2] },
    })],
    ['peso no numérico', JSON.stringify({
      ...JSON.parse(live(2).serialize()),
      weights: {
        ...JSON.parse(live(2).serialize()).weights,
        hiddenBias: Array.from({ length: 9 }, (_, i) => (i === 0 ? 'NaN' : 0)),
      },
    })],
  ])('lanza RangeError: %s', (_label, raw) => {
    expect(() => new BrainV05(CONFIG).deserialize(raw)).toThrow(RangeError);
  });
});

describe('cerebro v0.5 — dispose', () => {
  it('libera la red y cierra think/reinforce/deserialize', () => {
    const brain = live(5);
    expect(brain.isDisposed()).toBe(false);
    brain.dispose();
    expect(brain.isDisposed()).toBe(true);
    expect(() => brain.think(VECTOR)).toThrow(/desechado/);
    expect(() => brain.reinforce(0, 1)).toThrow(/desechado/);
    expect(() => brain.deserialize(live(2).serialize())).toThrow(/desechado/);
    expect(brain.getDebugState().weightNorm).toBe(0);
  });
});
