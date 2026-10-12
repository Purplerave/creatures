/**
 * Reacciones químicas de primer orden (A → B), deterministas.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { getChemicalDef } from '../src/biochem/chemicals';
import { CHEMICAL_REACTIONS, reactionTransfer } from '../src/biochem/reactions';

describe('reacciones químicas', () => {
  it('dopamina produce oxitocina (A → B)', () => {
    const engine = new BiochemEngine({ initialChemicals: { dopamina: 1, oxitocina: 0 } });
    engine.tick(1);
    expect(engine.getChemical('oxitocina')).toBeGreaterThan(0);
    expect(engine.getChemical('dopamina')).toBeLessThan(1);
  });

  it('la cadena completa dopamina → oxitocina → serotonina funciona', () => {
    const engine = new BiochemEngine({ initialChemicals: { dopamina: 1 } });
    for (let i = 0; i < 500; i++) engine.tick(0.1);
    expect(engine.getChemical('serotonina')).toBeGreaterThan(0);
    expect(engine.getChemical('dopamina')).toBeLessThan(0.01);
  });

  it('dopamina sigue una ley exponencial: e^(−(decay + k)·t)', () => {
    const decay = getChemicalDef('dopamina').decayPerSecond;
    const k = CHEMICAL_REACTIONS.find((r) => r.from === 'dopamina')!.k;
    const engine = new BiochemEngine({ initialChemicals: { dopamina: 1 } });
    const t = 2;
    for (let i = 0; i < 20; i++) engine.tick(t / 20);
    expect(engine.getChemical('dopamina')).toBeCloseTo(Math.exp(-(decay + k) * t), 9);
  });

  it('la transferencia es acotada al reactivo disponible', () => {
    expect(reactionTransfer(0.1, 100, 1)).toBeCloseTo(0.1, 9);
    expect(reactionTransfer(0, 1, 1)).toBe(0);
    expect(reactionTransfer(1, 0, 1)).toBe(0);
    expect(reactionTransfer(1, 1, 0)).toBe(0);
  });
});
