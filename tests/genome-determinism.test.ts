/**
 * Determinismo del genoma: misma semilla + misma intensidad ⇒ hijo idéntico
 * byte a byte; serialización estable y roundtrip.
 */
import { describe, expect, it } from 'vitest';
import { Genome } from '../src/genome/genome';
import { GENOME_SCHEMA_VERSION } from '../src/contracts/igenome';

describe('determinismo del genoma', () => {
  it('mismo padre + misma semilla + misma intensity ⇒ hijo idéntico byte a byte', () => {
    const parent = new Genome({ seed: 12345 });
    const a = parent.clone();
    const b = parent.clone();
    a.mutate(42, 0.5);
    b.mutate(42, 0.5);
    expect(a.serialize()).toBe(b.serialize());
    expect(a.toConfig()).toEqual(b.toConfig());
  });

  it('la semilla de mutación pesa: mismas semillas dan igual aunque cambie el orden de construcción', () => {
    const seed = 987654321;
    const first = new Genome({ seed: 1 });
    first.mutate(seed, 1);
    const second = new Genome({ seed: 1 });
    second.mutate(seed, 1);
    expect(first.serialize()).toBe(second.serialize());
  });

  it('serialize → deserialize → serialize es idéntico (roundtrip)', () => {
    const original = new Genome({ genes: { metabolismo: 0.8, capacidad: 0.3 }, seed: 7 });
    const json = original.serialize();

    const restored = new Genome();
    const config = restored.deserialize(json);
    expect(restored.serialize()).toBe(json);
    expect(config).toEqual(original.toConfig());

    // Y la config devuelta reconstruye otro genoma idéntico.
    expect(new Genome(config).serialize()).toBe(json);
  });

  it('dos construcciones por defecto son idénticas (sin semilla aleatoria)', () => {
    expect(new Genome().serialize()).toBe(new Genome().serialize());
  });

  it('mutar no cambia la seed creadora ni la versión de esquema', () => {
    const g = new Genome({ seed: 99 });
    g.mutate(1, 1);
    const cfg = g.toConfig();
    expect(cfg.seed).toBe(99);
    expect(cfg.schemaVersion).toBe(GENOME_SCHEMA_VERSION);
  });

  it('clone() es una copia independiente con el mismo estado', () => {
    const g = new Genome({ seed: 3 });
    const c = g.clone();
    expect(c.serialize()).toBe(g.serialize());
    c.mutate(1, 1);
    expect(c.serialize()).not.toBe(g.serialize());
  });
});
