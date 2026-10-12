/**
 * Extensibilidad: añadir un gen = una fila con registerGene(), sin tocar
 * genome.ts, phenotype.ts ni el motor (mismo criterio que registerDrive).
 */
import { describe, expect, it } from 'vitest';
import { Genome } from '../src/genome/genome';
import { getGeneDef, hasGene, listGeneDefs, registerGene } from '../src/genome/genes';
import { BiochemEngine } from '../src/biochem/engine';

describe('tabla extensible de genes', () => {
  it('el registro arranca con los 9 genes semilla', () => {
    const ids = listGeneDefs().map((g) => g.id);
    for (const id of [
      'metabolismo', 'templanza', 'sociabilidad', 'alerta', 'calma',
      'resiliencia', 'capacidad', 'exploracion', 'aprendizaje',
    ]) {
      expect(ids).toContain(id);
    }
    expect(ids.length).toBeGreaterThanOrEqual(9);
  });

  it('un gen nuevo: registerGene → getGene → phenotype, sin tocar el motor', () => {
    const id = 'gen-prueba-extensible';
    if (!hasGene(id)) {
      registerGene({
        id,
        label: 'Gen de prueba',
        description: 'Gen de prueba para el test de extensibilidad',
        defaultWeight: 0.5,
        range: [0, 1],
        drives: [{ driveId: 'hambre', weight: 0.6 }],
      });
    }
    expect(getGeneDef(id).label).toBe('Gen de prueba');

    // Genoma construido DESPUÉS del registro: lo materializa con su default.
    const genome = new Genome();
    expect(genome.getGene(id)).toBe(0.5);

    // Con valor 1 el delta sobre hambre es exactamente +0.6.
    const custom = new Genome({ genes: { [id]: 1 } });
    expect(custom.getGene(id)).toBe(1);
    const phenotype = custom.getPhenotype();
    expect(phenotype.driveDecayDeltas.hambre).toBeCloseTo(0.6, 12);

    // Y el motor lo aplica sin ninguna modificación suya.
    const engine = new BiochemEngine({ phenotype });
    const base = new BiochemEngine();
    engine.tick(1);
    base.tick(1);
    expect(engine.getDrive('hambre').level).toBeGreaterThan(base.getDrive('hambre').level);
  });

  it('un gen de knob de cerebro aparece en phenotype.brain', () => {
    const id = 'gen-cerebro-prueba';
    if (!hasGene(id)) {
      registerGene({
        id,
        label: 'Knob de prueba',
        description: 'Gen de prueba sobre un knob del cerebro',
        defaultWeight: 0.5,
        range: [0, 1],
        brain: { knob: 'learningRate', range: [0, 0.2] },
      });
    }
    const genome = new Genome({ genes: { [id]: 1 } });
    expect(genome.getPhenotype().brain.learningRate).toBeCloseTo(0.2, 12);
    const mid = new Genome({ genes: { [id]: 0.5 } });
    expect(mid.getPhenotype().brain.learningRate).toBeCloseTo(0.1, 12);
  });

  it('rechaza ids duplicados', () => {
    expect(() =>
      registerGene({
        id: 'metabolismo',
        label: 'x',
        description: 'x',
        defaultWeight: 0.5,
        range: [0, 1],
      }),
    ).toThrow(/duplicado/i);
  });

  it('valida rango y peso por defecto al registrar', () => {
    expect(() =>
      registerGene({ id: 'gen-malo', label: 'x', description: 'x', defaultWeight: 0.5, range: [0, 2] }),
    ).toThrow(RangeError);
    expect(() =>
      registerGene({ id: 'gen-malo', label: 'x', description: 'x', defaultWeight: 5, range: [0, 1] }),
    ).toThrow(RangeError);
    expect(hasGene('gen-malo')).toBe(false);
  });

  it('getGene de un id desconocido lanza RangeError', () => {
    expect(() => new Genome().getGene('no-existe')).toThrow(RangeError);
  });
});
