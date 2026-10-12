/**
 * Cerebro v0.5 REAL — forma y contrato:
 * knobs (los del genoma incluidos), normalización del vector de entrada,
 * rango/nombres de la salida y cumplimiento estructural de `BrainV05Like`.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAIN_SEED,
  DEFAULT_EPSILON_FLOOR,
  DEFAULT_HIDDEN_SIZE,
  INPUT_LAYOUT,
  INPUT_SIZE,
  BrainV05,
  resolveBrainV05Config,
} from '../src/brain/brain-v05';
import type { BrainV05Input, BrainV05Like } from '../src/brain/brainv05-types';
import { DEFAULT_ACTIONS } from '../src/brain/actions';

const ACTION_VALUES = DEFAULT_ACTIONS.map((a) => a.value);

function input(overrides: Partial<BrainV05Input> = {}): BrainV05Input {
  return {
    drives: overrides.drives ?? [0.8, 0.4, 0.2, 0.6, 0.5, 0.3, 0.1, 0.7],
    stimuli: overrides.stimuli ?? [0.5, 0.2, 0.3],
    genome: overrides.genome ?? [0.5, 0.5, 0.5, 0.5],
  };
}

describe('cerebro v0.5 — configuración', () => {
  it('cumple BrainV05Like estructuralmente (sin implements explícito del consumidor)', () => {
    const like: BrainV05Like = new BrainV05();
    expect(typeof like.think).toBe('function');
    expect(typeof like.reinforce).toBe('function');
    expect(typeof like.serialize).toBe('function');
    expect(typeof like.deserialize).toBe('function');
    expect(typeof like.dispose).toBe('function');
  });

  it('defaults: 15 entradas (8 drives + 3 estímulos + 4 genes), oculta 12, suelo ε 5 %', () => {
    expect(INPUT_SIZE).toBe(15);
    expect(INPUT_LAYOUT).toEqual({ drives: 8, stimuli: 3, genome: 4 });
    const config = new BrainV05().getConfig();
    expect(config.hiddenSize).toBe(DEFAULT_HIDDEN_SIZE);
    expect(config.epsilonFloor).toBe(DEFAULT_EPSILON_FLOOR);
    expect(config.seed).toBe(DEFAULT_BRAIN_SEED);
  });

  it('aplica los knobs del genoma (hiddenSize, epsilonInitial, learningRate)', () => {
    const brain = new BrainV05({ hiddenSize: 34, epsilonInitial: 0.325, learningRate: 0.155 });
    expect(brain.getConfig()).toMatchObject({ hiddenSize: 34, epsilonInitial: 0.325, learningRate: 0.155 });
    expect(brain.getDebugState().config.hiddenSize).toBe(34);
  });

  it('sanea el suelo de ε para que nunca supere al ε inicial', () => {
    expect(resolveBrainV05Config({ epsilonInitial: 0.02 }).epsilonFloor).toBeCloseTo(0.02, 12);
    expect(resolveBrainV05Config({ epsilonInitial: 0.6 }).epsilonFloor).toBe(DEFAULT_EPSILON_FLOOR);
  });

  it('recorta ε y lo devuelve ya dentro de [suelo, inicial]', () => {
    expect(resolveBrainV05Config({ epsilonInitial: 3 }).epsilonInitial).toBe(1);
    expect(resolveBrainV05Config({ epsilonInitial: -2 }).epsilonInitial).toBe(0);
  });

  it.each([
    ['hiddenSize 0', { hiddenSize: 0 }],
    ['hiddenSize 500', { hiddenSize: 500 }],
    ['hiddenSize no finito', { hiddenSize: Number.NaN }],
    ['learningRate 0', { learningRate: 0 }],
    ['learningRate > 1', { learningRate: 1.5 }],
    ['epsilonDecay 0', { epsilonDecay: 0 }],
    ['epsilonDecay > 1', { epsilonDecay: 1.2 }],
    ['maxWeight 0', { maxWeight: 0 }],
    ['seed no finita', { seed: Number.POSITIVE_INFINITY }],
  ])('lanza RangeError con %s', (_label, options) => {
    expect(() => new BrainV05(options)).toThrow(RangeError);
  });

  it('rechaza un espacio de acciones inválido', () => {
    expect(() => new BrainV05({ actions: [] })).toThrow(RangeError);
    expect(() => new BrainV05({ actions: [{ id: 'a', name: 'A', value: 2 }] })).toThrow(RangeError);
  });

  it('acepta un espacio de acciones propio y solo devuelve sus códigos', () => {
    const brain = new BrainV05({
      actions: [
        { id: 'izquierda', name: 'Ir a la izquierda', value: -1 },
        { id: 'derecha', name: 'Ir a la derecha', value: 1 },
      ],
      epsilonInitial: 1,
      epsilonDecay: 1,
      seed: 11,
    });
    expect(brain.getActions().map((a) => a.id)).toEqual(['izquierda', 'derecha']);
    for (let i = 0; i < 50; i++) {
      expect([-1, 1]).toContain(brain.think(input()).action);
    }
  });

  it('getActions/getConfig devuelven copias (no se puede mutar el cerebro desde fuera)', () => {
    const brain = new BrainV05();
    brain.getActions()[0].value = 0.99;
    brain.getConfig().hiddenSize = 999;
    expect(brain.getActions()[0].value).toBe(DEFAULT_ACTIONS[0].value);
    expect(brain.getConfig().hiddenSize).toBe(DEFAULT_HIDDEN_SIZE);
  });
});

describe('cerebro v0.5 — vector de entrada', () => {
  it('recorta valores fuera de 0..1 y convierte NaN en 0 (mismas puntuaciones que la versión saneada)', () => {
    const sucia = new BrainV05({ seed: 5 });
    const limpia = new BrainV05({ seed: 5 });
    const dirty = sucia.think(input({ drives: [1.7, -0.4, Number.NaN, 0.5, 0.5, 0.5, 0.5, 0.5] }));
    const clean = limpia.think(input({ drives: [1, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5] }));
    expect(dirty.action).toBe(clean.action);
    expect(sucia.getDebugState().scores).toEqual(limpia.getDebugState().scores);
  });

  it('rellena con 0 los vectores cortos y recorta los largos', () => {
    const brain = new BrainV05({ seed: 5 });
    const twin = new BrainV05({ seed: 5 });
    const short = brain.think({ drives: [0.5], stimuli: [], genome: [] });
    const padded = twin.think({
      drives: [0.5, 0, 0, 0, 0, 0, 0, 0],
      stimuli: [0, 0, 0],
      genome: [0, 0, 0, 0],
    });
    expect(short.action).toBe(padded.action);
    expect(brain.getDebugState().scores).toEqual(twin.getDebugState().scores);
  });

  it('coloca drives, estímulos y genoma en canales distintos (no se confunden)', () => {
    const zeros = { drives: [0, 0, 0, 0, 0, 0, 0, 0], stimuli: [0, 0, 0], genome: [0, 0, 0, 0] };
    const byDrive = new BrainV05({ seed: 9, epsilonInitial: 0 });
    const byStimulus = new BrainV05({ seed: 9, epsilonInitial: 0 });
    const byGenome = new BrainV05({ seed: 9, epsilonInitial: 0 });
    byDrive.think(input({ ...zeros, drives: [1, 0, 0, 0, 0, 0, 0, 0] }));
    byStimulus.think(input({ ...zeros, stimuli: [1, 0, 0] }));
    byGenome.think(input({ ...zeros, genome: [1, 0, 0, 0] }));
    const scoresDrive = byDrive.getDebugState().scores;
    const scoresStimulus = byStimulus.getDebugState().scores;
    const scoresGenome = byGenome.getDebugState().scores;
    expect(scoresDrive).not.toEqual(scoresStimulus);
    expect(scoresStimulus).not.toEqual(scoresGenome);
    expect(scoresDrive).not.toEqual(scoresGenome);
  });

  it('lanza RangeError si la entrada no es un objeto o un canal no es un array', () => {
    const brain = new BrainV05();
    expect(() => brain.think(null as never)).toThrow(RangeError);
    expect(() => brain.think({ drives: 5 as never, stimuli: [0, 0, 0], genome: [0, 0, 0, 0] })).toThrow(RangeError);
  });
});

describe('cerebro v0.5 — salida', () => {
  it('devuelve siempre un código del espacio de acciones con su nombre', () => {
    const brain = new BrainV05({ epsilonInitial: 1, epsilonDecay: 1, seed: 2 });
    for (let i = 0; i < 200; i++) {
      const result = brain.think(input());
      expect(ACTION_VALUES).toContain(result.action);
      expect(result.action).toBeGreaterThanOrEqual(-1);
      expect(result.action).toBeLessThanOrEqual(1);
      const action = DEFAULT_ACTIONS.find((a) => a.value === result.action);
      expect(result.actionName).toBe(action?.name);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.explored).toBe('boolean');
    }
  });

  it('las probabilidades softmax suman 1 y la confianza es la de la acción tomada', () => {
    const brain = new BrainV05({ epsilonInitial: 0, seed: 4 });
    const result = brain.think(input());
    const debug = brain.getDebugState();
    const total = debug.probabilities.reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(debug.probabilities[debug.lastDecision?.index ?? -1]).toBeCloseTo(result.confidence, 12);
  });

  it('con ε = 0 decide en modo greedy: misma entrada ⇒ misma decisión', () => {
    const brain = new BrainV05({ epsilonInitial: 0, seed: 8 });
    const first = brain.think(input());
    const second = brain.think(input());
    const third = brain.think(input());
    expect(first.explored).toBe(false);
    expect([second.action, third.action]).toEqual([first.action, first.action]);
  });
});
