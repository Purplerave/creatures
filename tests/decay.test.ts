/**
 * Decaimiento exponencial aproximado (químicos) y deriva de drives.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { getChemicalDef } from '../src/biochem/chemicals';
import { getDriveDef } from '../src/biochem/driveTable';
import { CHEMICAL_REACTIONS } from '../src/biochem/reactions';

describe('decaimiento', () => {
  it('un químico decae exponencialmente: nivel(t) = nivel0 · e^(−(d+k)·t)', () => {
    // dopamina decae (d) y además la reacción A→B la consume (k): leyes exponenciales.
    const d = getChemicalDef('dopamina').decayPerSecond;
    const k = CHEMICAL_REACTIONS.filter((r) => r.from === 'dopamina').reduce((s, r) => s + r.k, 0);
    const engine = new BiochemEngine({ initialChemicals: { dopamina: 1 } });
    const steps = 100;
    const dt = 0.1;
    for (let i = 0; i < steps; i++) engine.tick(dt);
    const expected = Math.exp(-(d + k) * steps * dt);
    expect(engine.getChemical('dopamina')).toBeCloseTo(expected, 9);
  });

  it('con dt más fino el resultado converge al mismo valor (consistencia)', () => {
    const a = new BiochemEngine({ initialChemicals: { cortisol: 1 } });
    const b = new BiochemEngine({ initialChemicals: { cortisol: 1 } });
    for (let i = 0; i < 100; i++) a.tick(0.1);
    for (let i = 0; i < 1000; i++) b.tick(0.01);
    expect(a.getChemical('cortisol')).toBeCloseTo(b.getChemical('cortisol'), 6);
  });

  it('un drive con deriva negativa decae linealmente (sin químicos)', () => {
    const def = getDriveDef('miedo');
    const engine = new BiochemEngine({
      initialDrives: { miedo: 0.8 },
      initialChemicals: { cortisol: 0 },
    });
    const t = 1;
    engine.tick(t);
    const expected = 0.8 + def.decayPerSecond * t;
    expect(engine.getDrive('miedo').level).toBeCloseTo(expected, 9);
  });

  it('tick(0) no cambia nada', () => {
    const engine = new BiochemEngine({ initialChemicals: { glucosa: 0.5 }, initialDrives: { hambre: 0.4 } });
    const before = engine.tick(0);
    const after = engine.tick(0);
    expect(after).toEqual(before);
  });
});
