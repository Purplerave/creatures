/**
 * Tests de Fase 4 espacial (`src/world/world.ts`) + protocolo reproducible A/B
 * de aprendizaje autónomo de comida en menos de 5 minutos simulados.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem';
import { createBrainRuntime } from '../src/brain';
import { BrainV05 } from '../src/brain/brain-v05';
import { actionFromValue } from '../src/brain/actions';
import { driveDiscomfort, driveReductionReward } from '../src/brain/reward';
import { Genome } from '../src/genome';
import { CreatureWorld } from '../src/world';

describe('mundo espacial 2D (Fase 4)', () => {
  it('desplaza a Nilo sin sobrepaso y dispara la acción exactamente al entrar en rango', () => {
    const world = new CreatureWorld({
      initialPosition: { x: 0.1, y: 0.69 },
      walkSpeed: 0.5,
    });
    const goal = world.setGoalAction('buscar');
    expect(goal.id).toBe('comedero');

    // A 0.2 s (distancia inicial ~0.74 > radio 0.11): se acerca pero aún no come.
    const step1 = world.advance(0.2);
    expect(step1.moved).toBe(true);
    expect(step1.arrived).toBe(false);
    expect(step1.triggeredInteraction).toBeNull();
    expect(world.getSnapshot().objects.find((o) => o.id === 'comedero')?.uses).toBe(0);

    // Avanza hasta cruzar el radio de interacción: dispara el impulso automáticamente.
    let triggered = step1.triggeredInteraction;
    for (let i = 0; i < 20 && !triggered; i++) {
      triggered = world.advance(0.1).triggeredInteraction;
    }
    expect(triggered).not.toBeNull();
    expect(triggered?.applied).toBe(true);
    expect(triggered?.objectId).toBe('comedero');
    expect(world.getSnapshot().creature.arrived).toBe(true);
    expect(world.getSnapshot().objects.find((o) => o.id === 'comedero')?.uses).toBe(1);
  });

  it('requireProximity retiene el impulso hasta alcanzar físicamente el objeto', () => {
    const world = new CreatureWorld({ initialPosition: { x: 0.5, y: 0.66 }, walkSpeed: 1 });
    const firstAttempt = world.performAction('buscar', { requireProximity: true });
    expect(firstAttempt.applied).toBe(false);
    expect(firstAttempt.impulse).toBeNull();

    const arrival = world.advance(0.5);
    expect(arrival.arrived).toBe(true);
    expect(arrival.triggeredInteraction?.applied).toBe(true);
  });

  it('hitTestObject detecta clics sobre objetos cercanos en coordenadas de escena', () => {
    const world = new CreatureWorld();
    const comedero = world.getSnapshot().objects.find((o) => o.id === 'comedero')!;
    expect(world.hitTestObject(comedero.position)?.id).toBe('comedero');
    expect(world.hitTestObject({ x: 0.02, y: 0.02 })).toBeNull();
  });

  it('serializa y restaura atómicamente posición, meta pendiente y usos', () => {
    const original = new CreatureWorld({ initialPosition: { x: 0.2, y: 0.7 }, walkSpeed: 0.6 });
    original.performAction('explorar');
    original.setGoalAction('buscar');
    original.advance(0.35);

    const json = original.serialize();
    const restored = new CreatureWorld();
    restored.deserialize(json);

    expect(restored.serialize()).toBe(json);
    expect(restored.getSnapshot()).toEqual(original.getSnapshot());

    // Un JSON corrupto lanza RangeError y conserva intacto el estado previo.
    const snapshotBeforeBadLoad = restored.getSnapshot();
    expect(() => restored.deserialize('{"schemaVersion":999}')).toThrow(RangeError);
    expect(restored.getSnapshot()).toEqual(snapshotBeforeBadLoad);
  });

  it('protocolo A/B reproducible (<5 min simulados): el agente reforzado aprende a buscar comida en el espacio', () => {
    function runSpatialEpisode(enableReinforcement: boolean): {
      foodUses: number;
      meanDiscomfort: number;
      finalDiscomfort: number;
      buscarProbabilityWhenHungry: number;
    } {
      const seed = 20261021;
      const genome = new Genome({ genes: { metabolismo: 1 }, seed });
      const brainModel = new BrainV05({
        hiddenSize: 20,
        learningRate: 0.25,
        epsilonInitial: 0.4,
        epsilonDecay: 0.985,
        epsilonFloor: 0.04,
        seed,
      });
      const runtime = createBrainRuntime(genome, () => brainModel);
      const actions = brainModel.getActions();
      const engine = new BiochemEngine({
        initialDrives: {
          hambre: 0.9,
          energia: 0.45,
          sueno: 0.2,
          curiosidad: 0.45,
          vinculo: 0.65,
          aburrimiento: 0.2,
          miedo: 0.08,
          confort: 0.68,
        },
        initialChemicals: {
          glucosa: 0.05,
          adenosina: 0.1,
          dopamina: 0.25,
          cortisol: 0.06,
          oxitocina: 0.35,
          serotonina: 0.4,
        },
        phenotype: runtime.phenotype,
      });
      const world = new CreatureWorld({ walkSpeed: 0.36 });

      const dt = 0.05;
      const totalSimSeconds = 240; // 4 minutos (< 5 minutos simulados)
      const decisionInterval = 2.6; // > cooldown de 2.0 s del comedero
      let simTime = 0;
      let nextDecision = 0;
      let prevDiscomfort = driveDiscomfort(engine.tick(0).drives);
      let discomfortSum = 0;
      let discomfortSamples = 0;

      for (let step = 1; simTime < totalSimSeconds; step++) {
        simTime += dt;
        const worldStep = world.advance(dt);
        if (worldStep.triggeredInteraction?.applied && worldStep.triggeredInteraction.impulse) {
          engine.applyImpulse(worldStep.triggeredInteraction.impulse);
        }
        // Entorno metabólicamente exigente: el gasto energético basal exige forrajeo activo.
        engine.applyImpulse({ drives: { hambre: 0.0025 }, chemicals: { glucosa: -0.003 } });
        const snap = engine.tick(dt);
        discomfortSum += driveDiscomfort(snap.drives);
        discomfortSamples += 1;

        if (simTime >= nextDecision) {
          const currentDiscomfort = driveDiscomfort(snap.drives);
          if (enableReinforcement && step > 1) {
            runtime.brain.reinforce(driveReductionReward(prevDiscomfort, currentDiscomfort, 10));
          }
          prevDiscomfort = currentDiscomfort;

          const out = runtime.brain.think({
            drives: snap.drives,
            chemicals: snap.chemicals,
            tick: step,
          });
          const picked = actionFromValue(actions, out.actions[0] ?? 0);
          if (picked) {
            const immediate = world.performAction(picked.action.id, { requireProximity: true });
            if (immediate.applied && immediate.impulse) {
              engine.applyImpulse(immediate.impulse);
            }
          }
          nextDecision = simTime + decisionInterval;
        }
      }

      // Evaluamos la política aprendida ante estado de hambre aguda idéntico.
      const finalSnap = engine.tick(0);
      runtime.brain.think({
        drives: {
          ...finalSnap.drives,
          hambre: { level: 0.92, target: 0.92 },
        },
        chemicals: { ...finalSnap.chemicals, glucosa: 0.05 },
        tick: 9999,
      });
      const debug = brainModel.getDebugState();
      const buscarIndex = actions.findIndex((a) => a.id === 'buscar');
      const foodUses = world.getSnapshot().objects.find((o) => o.id === 'comedero')?.uses ?? 0;

      return {
        foodUses,
        meanDiscomfort: discomfortSum / discomfortSamples,
        finalDiscomfort: driveDiscomfort(finalSnap.drives),
        buscarProbabilityWhenHungry: debug.probabilities[buscarIndex] ?? 0,
      };
    }

    const groupALearned = runSpatialEpisode(true);
    const groupALearnedRepeat = runSpatialEpisode(true);
    const groupBControl = runSpatialEpisode(false);

    // 1. Reproducibilidad determinista exacta bit a bit.
    expect(groupALearned).toEqual(groupALearnedRepeat);
    // 2. En < 5 min simulados, el grupo reforzado aprende a acudir mucho más al comedero,
    //    eleva drásticamente P(buscar | hambre) y mantiene menor malestar medio y final.
    expect(groupALearned.foodUses).toBeGreaterThan(groupBControl.foodUses + 10);
    expect(groupALearned.buscarProbabilityWhenHungry).toBeGreaterThan(
      groupBControl.buscarProbabilityWhenHungry + 0.25,
    );
    expect(groupALearned.meanDiscomfort).toBeLessThan(groupBControl.meanDiscomfort);
    expect(groupALearned.finalDiscomfort).toBeLessThan(groupBControl.finalDiscomfort);
  });
});
