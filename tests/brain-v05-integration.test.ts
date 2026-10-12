/**
 * Integración del cerebro v0.5 REAL en el runtime aprobado:
 * Genome → fenotipo → knobs → BrainV05 → BrainV05Adapter → BiochemEngine,
 * con el refuerzo por reducción de malestar que usa `main.ts`.
 * El adaptador no se modifica: se verifica que sigue siendo la única puerta.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem';
import { Genome } from '../src/genome';
import { createBrainRuntime } from '../src/brain/runtime';
import { BrainV05 } from '../src/brain/brain-v05';
import { PlaceholderBrain } from '../src/brain/placeholder-brain';
import { DEFAULT_ACTIONS, actionFromValue } from '../src/brain/actions';
import { driveDiscomfort, driveReductionReward } from '../src/brain/reward';
import type { BrainInputs } from '../src/contracts/ibrain';
import type { TickResult } from '../src/contracts/types';

const INITIAL_CHEMICALS = {
  glucosa: 0.8,
  adenosina: 0.12,
  dopamina: 0.4,
  cortisol: 0.06,
  oxitocina: 0.24,
  serotonina: 0.3,
};
const INITIAL_DRIVES = {
  hambre: 0.22,
  energia: 0.76,
  sueno: 0.18,
  curiosidad: 0.62,
  vinculo: 0.54,
  aburrimiento: 0.2,
  miedo: 0.08,
  confort: 0.68,
};

interface World {
  engine: BiochemEngine;
  model: BrainV05;
  inputsOf(snapshot: TickResult, tick: number): BrainInputs;
}

function buildWorld(genes: Record<string, number> = {}, seed = 20261012): World {
  const genome = new Genome({ genes });
  const phenotype = genome.getPhenotype();
  const model = new BrainV05({ ...phenotype.brain, seed });
  const runtime = createBrainRuntime(genome, () => model);
  const engine = new BiochemEngine({
    initialChemicals: INITIAL_CHEMICALS,
    initialDrives: INITIAL_DRIVES,
    phenotype: runtime.phenotype,
  });
  return {
    engine,
    model,
    inputsOf: (snapshot, tick) => ({ drives: snapshot.drives, chemicals: snapshot.chemicals, tick }),
  };
}

describe('integración — genoma ⇒ cerebro real', () => {
  it('los genes de knobs configuran la red (capacidad, exploración, aprendizaje)', () => {
    const maxed = new BrainV05({
      ...new Genome({ genes: { capacidad: 1, exploracion: 1, aprendizaje: 1 } }).getPhenotype().brain,
    }).getConfig();
    expect(maxed.hiddenSize).toBe(64);
    expect(maxed.epsilonInitial).toBeCloseTo(0.6, 12);
    expect(maxed.learningRate).toBeCloseTo(0.3, 12);

    const minimal = new BrainV05({
      ...new Genome({ genes: { capacidad: 0, exploracion: 0, aprendizaje: 0 } }).getPhenotype().brain,
    }).getConfig();
    expect(minimal.hiddenSize).toBe(4);
    expect(minimal.epsilonInitial).toBeCloseTo(0.05, 12);
    expect(minimal.learningRate).toBeCloseTo(0.01, 12);
  });

  it('el genoma por defecto (0.5) da una red media y ε por encima del suelo', () => {
    const world = buildWorld();
    const config = world.model.getConfig();
    expect(config.hiddenSize).toBe(34);
    expect(config.epsilonInitial).toBeGreaterThan(config.epsilonFloor);
    expect(config.learningRate).toBeGreaterThan(0.01);
  });
});

describe('integración — bucle completo', () => {
  it('la salida viaja por el adaptador sin tocarlo: código de acción + debug', () => {
    const genome = new Genome();
    const model = new BrainV05({ ...genome.getPhenotype().brain, epsilonInitial: 1, epsilonDecay: 1 });
    const runtime = createBrainRuntime(genome, () => model);
    const engine = new BiochemEngine({ initialChemicals: INITIAL_CHEMICALS, initialDrives: INITIAL_DRIVES });

    for (let tick = 0; tick < 60; tick++) {
      const snapshot = engine.tick(1 / 60);
      const output = runtime.brain.think({ drives: snapshot.drives, chemicals: snapshot.chemicals, tick });
      expect(output.actions).toHaveLength(1);
      const [value] = output.actions;
      expect(actionFromValue(DEFAULT_ACTIONS, value ?? Number.NaN)).not.toBeNull();
      expect(output.debug?.confidence).toBeGreaterThanOrEqual(0);
      expect(output.debug?.confidence).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(output.debug?.explored);
    }
    // Regla D1 ampliada por la D2 (excepción autorizada por la CEO): el
    // adaptador expone think + reinforce + getDebugState (puerto de
    // depuración acotado para la vista L2). Ver tests/adapter-interface.test.ts
    // y docs/ADAPTER.md §Debug. Ningún getter suelto.
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(runtime.brain)).filter((n) => n !== 'constructor').sort())
      .toEqual(['getDebugState', 'reinforce', 'think']);
  });

  it('premiar/castigar desde la app refuerza la última decisión en la red', () => {
    const world = buildWorld();
    const genome = new Genome();
    const runtime = createBrainRuntime(genome, () => world.model);
    const snapshot = world.engine.tick(1 / 60);
    expect(world.model.getDebugState().reinforces).toBe(0);
    runtime.brain.reinforce(1); // sin think previo ⇒ no-op
    expect(world.model.getDebugState().reinforces).toBe(0);

    const output = runtime.brain.think(world.inputsOf(snapshot, 1));
    runtime.brain.reinforce(1);
    const debug = world.model.getDebugState();
    expect(debug.reinforces).toBe(1);
    expect(debug.lastReward).toBe(1);
    expect(output.actions[0]).toBeDefined();
  });

  it('es determinista: dos mundos idénticos toman las mismas decisiones', () => {
    const play = (): { actions: number[]; serial: string } => {
      const world = buildWorld({ capacidad: 0.75, exploracion: 0.9, aprendizaje: 0.4 }, 1234);
      const genome = new Genome({ genes: { capacidad: 0.75, exploracion: 0.9, aprendizaje: 0.4 } });
      const runtime = createBrainRuntime(genome, () => world.model);
      const actions: number[] = [];
      let previous = driveDiscomfort(INITIAL_DRIVES as never);
      for (let tick = 1; tick <= 300; tick++) {
        const snapshot = world.engine.tick(1 / 60);
        const discomfort = driveDiscomfort(snapshot.drives);
        runtime.brain.reinforce(driveReductionReward(previous, discomfort));
        previous = discomfort;
        actions.push(runtime.brain.think(world.inputsOf(snapshot, tick)).actions[0] ?? Number.NaN);
      }
      return { actions, serial: world.model.serialize() };
    };
    expect(play().actions).toEqual(play().actions);
    expect(play().serial).toBe(play().serial);
  });

  it('el refuerzo por reducción de malestar cambia la red dentro del bucle', () => {
    const world = buildWorld();
    const genome = new Genome();
    const runtime = createBrainRuntime(genome, () => world.model);
    const birth = world.model.getDebugState().weightNorm;
    let previous = driveDiscomfort(INITIAL_DRIVES as never);
    for (let tick = 1; tick <= 600; tick++) {
      const snapshot = world.engine.tick(1 / 60);
      const discomfort = driveDiscomfort(snapshot.drives);
      runtime.brain.reinforce(driveReductionReward(previous, discomfort));
      previous = discomfort;
      runtime.brain.think(world.inputsOf(snapshot, tick));
    }
    const debug = world.model.getDebugState();
    expect(debug.thinks).toBe(600);
    // El primer refuerzo llega antes de la primera decisión ⇒ no-op (600 − 1).
    expect(debug.reinforces).toBe(599);
    expect(debug.weightNorm).not.toBeCloseTo(birth, 9);
    expect(debug.epsilon).toBeLessThan(debug.config.epsilonInitial);
    expect(debug.rewardTotal).toBeLessThan(0); // sin mundo, la deriva intrínseca castiga
  });

  it('los premios/castigos manuales enseñan una acción concreta en pocas pulsaciones', () => {
    const world = buildWorld({}, 5);
    const genome = new Genome();
    const runtime = createBrainRuntime(genome, () => world.model);
    const target = DEFAULT_ACTIONS[2];
    const targetIndex = 2;
    const snapshot = world.engine.tick(1 / 60);

    // Medida de partida: una decisión para poblar las probabilidades.
    runtime.brain.think(world.inputsOf(snapshot, 0));
    const before = world.model.getDebugState().probabilities[targetIndex];

    // Entrenamiento realista por la puerta pública: premio cuando Nilo hace lo
    // que queremos, castigo cuando no (el adaptador refuerza la última decisión).
    for (let i = 1; i <= 60; i++) {
      const output = runtime.brain.think(world.inputsOf(snapshot, i));
      runtime.brain.reinforce(output.actions[0] === target.value ? 1 : -1);
    }
    runtime.brain.think(world.inputsOf(snapshot, 99));
    const after = world.model.getDebugState().probabilities[targetIndex];
    expect(after).toBeGreaterThan(before + 0.2);
    expect(world.model.getDebugState().reinforces).toBe(60);
  });

  it('el placeholder sigue siendo enchufable en la misma fábrica (regresión)', () => {
    const genome = new Genome();
    const runtime = createBrainRuntime(genome, () => new PlaceholderBrain());
    const output = runtime.brain.think({ drives: {}, chemicals: {}, tick: 0 });
    expect(output.actions).toEqual([0]);
    expect(output.debug).toEqual({ confidence: 0, explored: 0 });
  });
});
