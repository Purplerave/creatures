/**
 * Acoplamientos drive↔chemical: subir/quitar un químico cambia el drive.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { getChemicalDef } from '../src/biochem/chemicals';

describe('acoplamiento drive↔chemical', () => {
  it('miedo sube con cortisol (y no sube sin cortisol)', () => {
    const conCortisol = new BiochemEngine({
      initialDrives: { miedo: 0 },
      initialChemicals: { cortisol: 1 },
    });
    const sinCortisol = new BiochemEngine({
      initialDrives: { miedo: 0 },
      initialChemicals: { cortisol: 0 },
    });
    conCortisol.tick(0.1);
    sinCortisol.tick(0.1);
    expect(conCortisol.getDrive('miedo').level).toBeGreaterThan(sinCortisol.getDrive('miedo').level);
    expect(sinCortisol.getDrive('miedo').level).toBe(0); // sin cortisol solo decae (ya en 0)
  });

  it('hambre baja si glucosa alta (y no si glucosa baja)', () => {
    const alta = new BiochemEngine({ initialDrives: { hambre: 0.5 }, initialChemicals: { glucosa: 1 } });
    const baja = new BiochemEngine({ initialDrives: { hambre: 0.5 }, initialChemicals: { glucosa: 0 } });
    alta.tick(0.1);
    baja.tick(0.1);
    expect(alta.getDrive('hambre').level).toBeLessThan(baja.getDrive('hambre').level);
    // La glucosa decae durante el tick (e^(−0.05·0.1)) antes de acoplar.
    const glucosaTrasTick = Math.exp(-getChemicalDef('glucosa').decayPerSecond * 0.1);
    expect(alta.getDrive('hambre').level).toBeCloseTo(0.5 + (0.03 - 2.5 * glucosaTrasTick) * 0.1, 9);
  });

  it('curiosidad sube con dopamina', () => {
    const engine = new BiochemEngine({ initialDrives: { curiosidad: 0.2 }, initialChemicals: { dopamina: 1 } });
    engine.tick(0.1);
    expect(engine.getDrive('curiosidad').level).toBeGreaterThan(0.2);
  });

  it('quitar el químico quita el empuje: el drive vuelve a decaer', () => {
    const withCortisol = new BiochemEngine({ initialDrives: { miedo: 0.5 }, initialChemicals: { cortisol: 1 } });
    const without = new BiochemEngine({ initialDrives: { miedo: 0.5 }, initialChemicals: { cortisol: 0 } });
    withCortisol.tick(1);
    without.tick(1);
    expect(withCortisol.getDrive('miedo').level).toBeGreaterThan(without.getDrive('miedo').level);
    expect(without.getDrive('miedo').level).toBeCloseTo(0.5 - 0.03, 9);
  });

  it('target refleja el empuje inmediato (proyección 1 s)', () => {
    const engine = new BiochemEngine({ initialDrives: { hambre: 0.5 }, initialChemicals: { glucosa: 0 } });
    engine.tick(0.1); // nivel = 0.5 + 0.03·0.1 = 0.503
    const state = engine.getDrive('hambre');
    expect(state.level).toBeCloseTo(0.503, 9);
    expect(state.target).toBeCloseTo(0.503 + 0.03, 9); // nivel + deriva (1 s)
  });
});
