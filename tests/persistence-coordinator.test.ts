/**
 * Tests del coordinador transaccional de partida completa (`src/persistence/`):
 * roundtrip determinista de los 5 subsistemas, rollback total ante corrupción
 * parcial, almacenamiento clave-valor e incubación de crías (`hatchOffspring`).
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem';
import { createBrainRuntime } from '../src/brain';
import { BrainV05 } from '../src/brain/brain-v05';
import { Genome } from '../src/genome';
import {
  clearGameFromStorage,
  hatchOffspring,
  loadGameFromStorage,
  resolveLifeStage,
  restoreGameState,
  saveGameToStorage,
  serializeGameState,
  type StorageLike,
} from '../src/persistence';
import { Vocabulary } from '../src/vocab';
import { CreatureWorld } from '../src/world';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('Fase 5 — persistencia coordinada y ciclo de vida', () => {
  it('guarda y restaura los 5 módulos con reproducción determinista exacta tras cargar', () => {
    const seed = 20261012;
    const genome = new Genome({ seed });
    genome.setMethylation('alerta', true);
    genome.mutateStructural(99, 0.3);

    const phenotype = genome.getPhenotype({ ageSeconds: 95 });
    const brainModel = new BrainV05({ ...phenotype.brain, seed });
    const brainRuntime = createBrainRuntime(genome, () => brainModel);
    const engine = new BiochemEngine({
      initialDrives: { hambre: 0.55, energia: 0.6 },
      initialChemicals: { glucosa: 0.5, dopamina: 0.35 },
      phenotype,
    });
    const vocabulary = new Vocabulary();
    vocabulary.teach('manzana', 'comida');
    vocabulary.teach('manzana', 'comida');
    vocabulary.tick(1.5);

    const world = new CreatureWorld();
    world.performAction('buscar');
    world.advance(0.4);

    for (let t = 0; t < 8; t++) {
      const snap = engine.tick(0.1);
      brainRuntime.brain.think({ drives: snap.drives, chemicals: snap.chemicals, tick: t });
      brainRuntime.brain.reinforce(0.4);
    }

    const savedJson = serializeGameState(
      { genome, engine, brainModel, vocabulary, world },
      { creatureName: 'Nilo', simTime: 95, frame: 570, autoReward: true, spatialStrict: true },
    );

    const storage = memoryStorage();
    expect(saveGameToStorage(storage, savedJson)).toBe(true);
    const loadedJson = loadGameFromStorage(storage)!;
    const restored = restoreGameState(loadedJson, seed);

    expect(restored.meta).toEqual({
      creatureName: 'Nilo',
      simTime: 95,
      frame: 570,
      autoReward: true,
      spatialStrict: true,
    });
    expect(restored.genome.isMethylated('alerta')).toBe(true);
    expect(restored.vocabulary.recall('comida')[0]?.word).toBe('manzana');
    expect(restored.world.getSnapshot()).toEqual(world.getSnapshot());

    // A partir del punto guardado, original y restaurada deciden idénticamente bit a bit.
    for (let step = 100; step < 110; step++) {
      const snapA = engine.tick(0.05);
      const snapB = restored.engine.tick(0.05);
      expect(snapB).toEqual(snapA);

      const outA = brainRuntime.brain.think({ drives: snapA.drives, chemicals: snapA.chemicals, tick: step });
      const outB = restored.brainRuntime.brain.think({
        drives: snapB.drives,
        chemicals: snapB.chemicals,
        tick: step,
      });
      expect(outB).toEqual(outA);
    }

    expect(clearGameFromStorage(storage)).toBe(true);
    expect(loadGameFromStorage(storage)).toBeNull();
    brainModel.dispose();
    restored.brainModel.dispose();
  });

  it('aborta transaccionalmente si cualquier submódulo está corrupto', () => {
    const genome = new Genome();
    const brainModel = new BrainV05({ ...genome.getPhenotype().brain, seed: 1 });
    const engine = new BiochemEngine({ phenotype: genome.getPhenotype() });
    const vocabulary = new Vocabulary();
    const world = new CreatureWorld();

    const valid = JSON.parse(
      serializeGameState(
        { genome, engine, brainModel, vocabulary, world },
        { creatureName: 'Nilo', simTime: 12, frame: 10, autoReward: true, spatialStrict: false },
      ),
    );
    valid.modules.world = '{"schemaVersion":1,"objects":{}}';

    expect(() => restoreGameState(JSON.stringify(valid), 1)).toThrow(RangeError);
    brainModel.dispose();
  });

  it('hatchOffspring incuba una nueva generación determinista y calcula etapas vitales', () => {
    const founder = new Genome({ seed: 7 });
    const childA = hatchOffspring({ parentA: founder, seed: 555 });
    const childB = hatchOffspring({ parentA: founder, seed: 555 });

    expect(childA.genome.getGeneration()).toBe(2);
    expect(childA.meta.creatureName).toBe(childB.meta.creatureName);
    expect(childA.genome.serialize()).toBe(childB.genome.serialize());

    expect(resolveLifeStage(0).id).toBe('embrion');
    expect(resolveLifeStage(45).id).toBe('cria');
    expect(resolveLifeStage(120).id).toBe('joven');
    expect(resolveLifeStage(300).id).toBe('adulto');

    childA.brainModel.dispose();
    childB.brainModel.dispose();
  });
});
