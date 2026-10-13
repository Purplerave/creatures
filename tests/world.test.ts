import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { driveDiscomfort, driveReductionReward } from '../src/brain/reward';
import { CreatureWorld, WORLD_OBJECTS, type WorldActionId } from '../src/world';

const EXPECTED_OBJECTS: Record<WorldActionId, string> = {
  descansar: 'nido',
  acurrucarse: 'nido',
  observar: 'luz-suave',
  explorar: 'pelota',
  buscar: 'comedero',
};

describe('mundo por eventos', () => {
  it('resuelve cada verbo contra un objeto y produce un impulso', () => {
    for (const [actionId, objectId] of Object.entries(EXPECTED_OBJECTS) as Array<[WorldActionId, string]>) {
      const world = new CreatureWorld();
      const result = world.performAction(actionId);
      expect(result).toMatchObject({ actionId, objectId, applied: true });
      expect(result.impulse).not.toBeNull();
      expect(world.getSnapshot().objects.find((object) => object.id === objectId)?.uses).toBe(1);
    }
  });

  it('bloquea temporalmente el objeto usado y lo reactiva con tiempo simulado', () => {
    const world = new CreatureWorld();
    const first = world.performAction('explorar');
    const blocked = world.performAction('explorar');
    expect(first.applied).toBe(true);
    expect(blocked.applied).toBe(false);
    expect(blocked.impulse).toBeNull();
    expect(blocked.message).toMatch(/recuperando/);
    expect(world.getSnapshot().objects.find((object) => object.id === 'pelota')?.uses).toBe(1);

    world.advance(1);
    expect(world.performAction('explorar').applied).toBe(true);
  });

  it('aplica la recompensa por reducción de malestar a una interacción real', () => {
    const engine = new BiochemEngine({
      initialDrives: { hambre: 0.5, energia: 0.4 },
      initialChemicals: { glucosa: 0.25 },
    });
    const world = new CreatureWorld();
    const before = engine.tick(0);
    const interaction = world.performAction('buscar');
    if (!interaction.impulse) throw new Error('Se esperaba el impulso de comida');
    engine.applyImpulse(interaction.impulse);
    const after = engine.tick(0);

    expect(after.drives.hambre?.level).toBeLessThan(before.drives.hambre?.level ?? 0);
    expect(after.drives.energia?.level).toBeGreaterThan(before.drives.energia?.level ?? 0);
    expect(after.chemicals.glucosa).toBeGreaterThan(before.chemicals.glucosa ?? 0);
    expect(driveReductionReward(driveDiscomfort(before.drives), driveDiscomfort(after.drives))).toBeGreaterThan(0);
  });

  it('devuelve snapshots aislados y rechaza entradas fuera de contrato', () => {
    const world = new CreatureWorld();
    const snapshot = world.getSnapshot();
    snapshot.objects[0]!.uses = 99;
    (snapshot.objects[0]!.actions as WorldActionId[]).push('buscar');
    expect(world.getSnapshot().objects[0]?.uses).toBe(0);
    expect(world.getSnapshot().objects[0]?.actions).toEqual(WORLD_OBJECTS[0]?.actions);

    expect(() => world.advance(-1)).toThrow(RangeError);
    expect(() => world.advance(Number.NaN)).toThrow(RangeError);
    expect(() => world.performAction('teleportar')).toThrow(RangeError);
  });
});
