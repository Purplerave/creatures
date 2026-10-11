/**
 * Determinismo: mismas condiciones + mismo dt ⇒ mismo resultado.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';

const INITIAL = {
  initialChemicals: { glucosa: 0.6, dopamina: 0.3, cortisol: 0.2, adenosina: 0.4 },
  initialDrives: { hambre: 0.5, energia: 0.5, miedo: 0.1, curiosidad: 0.7 },
} as const;

function runSequence(): ReturnType<BiochemEngine['tick']> {
  const engine = new BiochemEngine(INITIAL);
  const dts = [0.1, 0.05, 0.33, 0.01, 0.2, 0.1, 0.07];
  let last = engine.tick(0);
  for (const dt of dts) last = engine.tick(dt);
  return last;
}

describe('determinismo', () => {
  it('dos motores idénticos con los mismos ticks dan resultados idénticos', () => {
    expect(runSequence()).toEqual(runSequence());
  });

  it('dos ticks idénticos sobre el mismo estado dan idéntico resultado', () => {
    const a = new BiochemEngine(INITIAL);
    const b = new BiochemEngine(INITIAL);
    expect(a.tick(0.15)).toEqual(b.tick(0.15));
    expect(a.tick(0.15)).toEqual(b.tick(0.15));
  });

  it('el snapshot es un valor: mutarlo no afecta al motor', () => {
    const engine = new BiochemEngine(INITIAL);
    const snap = engine.tick(0.1);
    const levelBefore = snap.drives.hambre.level;
    snap.drives.hambre.level = 0.999;
    snap.chemicals.glucosa = 0.001;
    expect(engine.getDrive('hambre').level).toBe(levelBefore);
    expect(engine.getChemical('glucosa')).not.toBe(0.001);
  });

  it('lanza con dt negativo', () => {
    const engine = new BiochemEngine();
    expect(() => engine.tick(-0.01)).toThrow(RangeError);
  });
});
