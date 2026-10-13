import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';

describe('BiochemEngine.applyImpulse', () => {
  it('aplica deltas de drives y químicos con sus clamps', () => {
    const engine = new BiochemEngine({
      initialDrives: { hambre: 0.08, energia: 0.98 },
      initialChemicals: { glucosa: 0.95 },
    });

    engine.applyImpulse({
      drives: { hambre: -0.2, energia: 0.1 },
      chemicals: { glucosa: 0.2, dopamina: 0.15 },
    });

    expect(engine.getDrive('hambre').level).toBe(0);
    expect(engine.getDrive('energia').level).toBe(1);
    expect(engine.getChemical('glucosa')).toBe(1);
    expect(engine.getChemical('dopamina')).toBeCloseTo(0.15, 12);
  });

  it('actualiza el target del drive junto con su nivel', () => {
    const engine = new BiochemEngine({ initialDrives: { hambre: 0.4 } });
    const before = engine.getDrive('hambre');

    engine.applyImpulse({ drives: { hambre: -0.1 } });

    expect(engine.getDrive('hambre').level).toBeCloseTo(before.level - 0.1, 12);
    expect(engine.getDrive('hambre').target).toBeCloseTo(before.target - 0.1, 12);
  });

  it('valida el lote completo antes de mutar cualquier estado', () => {
    const engine = new BiochemEngine({ initialDrives: { hambre: 0.5 }, initialChemicals: { glucosa: 0.3 } });
    const beforeHunger = engine.getDrive('hambre');
    const beforeGlucose = engine.getChemical('glucosa');

    expect(() =>
      engine.applyImpulse({
        drives: { hambre: -0.2, 'drive-inexistente': 0.5 },
        chemicals: { glucosa: 0.2 },
      }),
    ).toThrow(RangeError);

    expect(engine.getDrive('hambre')).toEqual(beforeHunger);
    expect(engine.getChemical('glucosa')).toBe(beforeGlucose);
  });

  it('rechaza deltas no finitos y entidades no registradas', () => {
    const engine = new BiochemEngine();
    expect(() => engine.applyImpulse({ drives: { hambre: Number.NaN } })).toThrow(RangeError);
    expect(() => engine.applyImpulse({ chemicals: { 'quimico-fantasma': 0.1 } })).toThrow(RangeError);
  });
});
