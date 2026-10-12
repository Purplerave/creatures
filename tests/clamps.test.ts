/**
 * Saturación y clamps: nada sale de 0..1 (drives y químicos), ni target.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { listDriveDefs } from '../src/biochem/driveTable';
import { listChemicalDefs } from '../src/biochem/chemicals';

describe('clamps y saturación', () => {
  it('los drives nunca salen de su clamp tras muchos ticks', () => {
    const engine = new BiochemEngine({
      initialChemicals: { cortisol: 1, glucosa: 1, adenosina: 1 },
      initialDrives: { miedo: 1, hambre: 0, energia: 1 },
    });
    for (let i = 0; i < 500; i++) engine.tick(0.1);
    for (const def of listDriveDefs()) {
      const state = engine.getDrive(def.id);
      expect(state.level).toBeGreaterThanOrEqual(def.clamp[0]);
      expect(state.level).toBeLessThanOrEqual(def.clamp[1]);
      expect(state.target).toBeGreaterThanOrEqual(def.clamp[0]);
      expect(state.target).toBeLessThanOrEqual(def.clamp[1]);
      expect(Number.isNaN(state.level)).toBe(false);
    }
  });

  it('los químicos nunca superan 1 ni bajan de 0', () => {
    const engine = new BiochemEngine({
      initialChemicals: { dopamina: 1, oxitocina: 1, serotonina: 1, glucosa: 1, cortisol: 1, adenosina: 1 },
    });
    for (let i = 0; i < 500; i++) engine.tick(0.1);
    for (const def of listChemicalDefs()) {
      const level = engine.getChemical(def.id);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('un drive saturado en 0 sube si el empuje es positivo (recuperación)', () => {
    const engine = new BiochemEngine({
      initialDrives: { miedo: 0 },
      initialChemicals: { cortisol: 1 },
    });
    engine.tick(0.1);
    expect(engine.getDrive('miedo').level).toBeGreaterThan(0);
  });

  it('rechaza niveles iniciales de químico fuera de 0..1', () => {
    expect(() => new BiochemEngine({ initialChemicals: { glucosa: 1.5 } })).toThrow(RangeError);
    expect(() => new BiochemEngine({ initialChemicals: { glucosa: -0.1 } })).toThrow(RangeError);
  });

  it('rechaza ids no registrados en las opciones iniciales', () => {
    expect(() => new BiochemEngine({ initialDrives: { noexiste: 0.5 } })).toThrow(RangeError);
    expect(() => new BiochemEngine({ initialChemicals: { noexiste: 0.5 } })).toThrow(RangeError);
  });
});
