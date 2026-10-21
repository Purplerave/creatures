/**
 * Tests de serialización atómica de `BiochemEngine` (Fase 5).
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem';

describe('BiochemEngine — serialize / deserialize', () => {
  it('conserva exactamente niveles y continúa la misma trayectoria determinista', () => {
    const source = new BiochemEngine({
      initialDrives: { hambre: 0.42, energia: 0.71, sueno: 0.33, curiosidad: 0.6 },
      initialChemicals: { glucosa: 0.65, dopamina: 0.48, cortisol: 0.11 },
    });
    for (let i = 0; i < 30; i++) source.tick(1 / 60);
    source.applyImpulse({ drives: { hambre: -0.05 }, chemicals: { glucosa: 0.09 } });

    const serialized = source.serialize();
    const twin = new BiochemEngine();
    twin.deserialize(serialized);

    expect(twin.serialize()).toBe(serialized);
    for (let i = 0; i < 60; i++) {
      expect(twin.tick(1 / 60)).toEqual(source.tick(1 / 60));
    }
  });

  it('rechaza cargas corruptas o con ids desconocidos sin mutar el estado vivo', () => {
    const live = new BiochemEngine({
      initialDrives: { hambre: 0.3 },
      initialChemicals: { glucosa: 0.7 },
    });
    const before = live.serialize();

    expect(() => live.deserialize('no-json')).toThrow(RangeError);
    expect(() => live.deserialize('{"schemaVersion":2,"drives":{},"chemicals":{}}')).toThrow(RangeError);
    expect(() =>
      live.deserialize(
        JSON.stringify({
          schemaVersion: 1,
          drives: { drive_inexistente: { level: 0.5, target: 0.5 } },
          chemicals: {},
        }),
      ),
    ).toThrow(RangeError);

    expect(live.serialize()).toBe(before);
  });
});
