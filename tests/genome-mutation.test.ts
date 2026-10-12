/**
 * Mutación: intensidad, clamp a 0..1 y variación entre semillas.
 */
import { describe, expect, it } from 'vitest';
import { Genome } from '../src/genome/genome';
import { listGeneDefs } from '../src/genome/genes';

function values(g: Genome): number[] {
  return Object.values(g.toConfig().genes);
}

describe('mutación del genoma', () => {
  it('intensity 0 ⇒ el genoma no cambia', () => {
    const parent = new Genome({ seed: 11 });
    const child = parent.clone();
    child.mutate(42, 0);
    expect(child.serialize()).toBe(parent.serialize());
  });

  it('intensity > 0 ⇒ al menos un gen cambia', () => {
    const child = new Genome({ seed: 11 });
    const before = child.serialize();
    child.mutate(42, 0.5);
    expect(child.serialize()).not.toBe(before);

    const changed = values(child).some((v, i) => v !== values(new Genome({ seed: 11 }))[i]);
    expect(changed).toBe(true);
  });

  it('clamp: mutar sobre genes ya en 0 o 1 no sale de 0..1', () => {
    const ids = listGeneDefs().map((d) => d.id);
    const atMin = new Genome({ genes: Object.fromEntries(ids.map((id) => [id, 0])) });
    const atMax = new Genome({ genes: Object.fromEntries(ids.map((id) => [id, 1])) });
    for (const seed of [1, 2, 3, 4, 5]) {
      atMin.mutate(seed, 1);
      atMax.mutate(seed, 1);
      for (const v of [...values(atMin), ...values(atMax)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('semillas distintas ⇒ hijos distintos', () => {
    const a = new Genome({ seed: 1 });
    const b = new Genome({ seed: 1 });
    a.mutate(100, 1);
    b.mutate(200, 1);
    expect(a.serialize()).not.toBe(b.serialize());
  });

  it('los valores de gen se sanean a 0..1 en la construcción', () => {
    expect(() => new Genome({ genes: { metabolismo: 1.5 } })).toThrow(RangeError);
    expect(() => new Genome({ genes: { metabolismo: -0.1 } })).toThrow(RangeError);
    expect(() => new Genome({ genes: { metabolismo: Number.NaN } })).toThrow(RangeError);
  });
});
