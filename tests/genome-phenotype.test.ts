/**
 * Fenotipo aplicado al BiochemEngine:
 * - los genes cambian el decay del drive afectado en la dirección esperada;
 * - sin phenotype (o con deltas neutros) el motor es idéntico al base.
 */
import { describe, expect, it } from 'vitest';
import { Genome } from '../src/genome/genome';
import { BiochemEngine } from '../src/biochem/engine';
import { getDriveDef } from '../src/biochem/driveTable';

// Químicos a 0: así la deriva observada es puramente decayPerSecond · (1+delta)
// (con glucosa el acoplamiento −2.5·g al hambre la hundiría a 0 en ambos motores).
const INITIAL = {
  initialDrives: { hambre: 0.5, energia: 0.5 },
} as const;

function run(engine: BiochemEngine, dt = 0.1, steps = 10): void {
  for (let i = 0; i < steps; i++) engine.tick(dt);
}

describe('fenotipo del genoma sobre el motor', () => {
  it('metabolismo alto acelera la hambre y acelera el consumo de energía', () => {
    const high = new Genome({ genes: { metabolismo: 1 } });
    const base = new Genome(); // metabolismo 0.5 ⇒ delta 0
    expect(high.getPhenotype().driveDecayDeltas.hambre).toBeCloseTo(0.4, 12);

    const eHigh = new BiochemEngine({ ...INITIAL, phenotype: high.getPhenotype() });
    const eBase = new BiochemEngine({ ...INITIAL, phenotype: base.getPhenotype() });
    run(eHigh);
    run(eBase);

    // hambre: deriva positiva ⇒ sube más con metabolismo alto.
    expect(eHigh.getDrive('hambre').level).toBeGreaterThan(eBase.getDrive('hambre').level);
    // energía: deriva negativa ⇒ cae más rápido con metabolismo alto.
    expect(eHigh.getDrive('energia').level).toBeLessThan(eBase.getDrive('energia').level);
  });

  it('el delta se aplica exactamente: decay efectivo = base · (1 + delta)', () => {
    const g = new Genome({ genes: { metabolismo: 0.75 } });
    const delta = g.getPhenotype().driveDecayDeltas.hambre ?? 0;
    expect(delta).toBeCloseTo((2 * 0.75 - 1) * 0.4, 12);

    const engine = new BiochemEngine({ phenotype: g.getPhenotype() });
    engine.tick(1);
    const expected = getDriveDef('hambre').decayPerSecond * (1 + delta);
    expect(engine.getDrive('hambre').level).toBeCloseTo(expected, 12);
  });

  it('sin phenotype el motor es idéntico al de Fase 0 (comportamiento por defecto)', () => {
    const a = new BiochemEngine(INITIAL);
    const b = new BiochemEngine({ ...INITIAL, phenotype: undefined });
    for (let i = 0; i < 10; i++) {
      expect(a.tick(0.1)).toEqual(b.tick(0.1));
    }
    // Y sigue la deriva de la tabla, sin sorpresas.
    const c = new BiochemEngine();
    c.tick(1);
    expect(c.getDrive('hambre').level).toBeCloseTo(getDriveDef('hambre').decayPerSecond, 12);
  });

  it('un phenotype con deltas a 0 es bit a bit igual que no llevar phenotype', () => {
    const neutral = new Genome().getPhenotype(); // todos los genes en 0.5 ⇒ delta 0
    for (const delta of Object.values(neutral.driveDecayDeltas)) {
      expect(delta).toBeCloseTo(0, 12);
    }
    const a = new BiochemEngine(INITIAL);
    const b = new BiochemEngine({ ...INITIAL, phenotype: neutral });
    for (let i = 0; i < 10; i++) {
      expect(b.tick(0.1)).toEqual(a.tick(0.1));
    }
  });

  it('los knobs del cerebro se resuelven dentro de su rango', () => {
    const low = new Genome({ genes: { capacidad: 0, exploracion: 0, aprendizaje: 0 } }).getPhenotype();
    const high = new Genome({ genes: { capacidad: 1, exploracion: 1, aprendizaje: 1 } }).getPhenotype();
    expect(low.brain.hiddenSize).toBe(4);
    expect(high.brain.hiddenSize).toBe(64);
    expect(low.brain.epsilonInitial).toBeCloseTo(0.05, 12);
    expect(high.brain.epsilonInitial).toBeCloseTo(0.6, 12);
    expect(low.brain.learningRate).toBeCloseTo(0.01, 12);
    expect(high.brain.learningRate).toBeCloseTo(0.3, 12);
  });

  it('rechaza deltas de drives no registrados', () => {
    expect(
      () => new BiochemEngine({ phenotype: { driveDecayDeltas: { 'drive-fantasma': 0.5 }, brain: {} } }),
    ).toThrow(RangeError);
  });

  it('el motor no muta la tabla de drives (driveTable intacta tras aplicar phenotype)', () => {
    const before = getDriveDef('hambre').decayPerSecond;
    new BiochemEngine({ phenotype: new Genome({ genes: { metabolismo: 1 } }).getPhenotype() });
    expect(getDriveDef('hambre').decayPerSecond).toBe(before);
  });
});
