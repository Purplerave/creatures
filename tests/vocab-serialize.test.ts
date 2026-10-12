/**
 * Serialización: roundtrip serialize → deserialize idéntico (entradas,
 * confianzas, reloj y stats), estabilidad byte a byte y saneado del JSON.
 */
import { describe, expect, it } from 'vitest';
import { Vocabulary } from '../src/vocab/vocabulary';
import { VOCAB_SCHEMA_VERSION } from '../src/contracts/ivocab';

function buildSample(): Vocabulary {
  const vocab = new Vocabulary({ decayPerSecond: 0.1 });
  vocab.teach('comida', 'manzana');
  vocab.teach('comida', 'manzana');
  vocab.teach('comida', 'manzana'); // aprendida (1.0)
  vocab.teach('verde', 'color'); // 0.34
  vocab.teach('verde', 'luz'); // otra entrada de la misma palabra
  vocab.tick(4); // verde/color: 0.34 − 0.4 → 0; comida: 1.0 → 0.6 (cae de «aprendida»)
  vocab.teach('agua', 'beber');
  vocab.teach('agua', 'beber');
  vocab.teach('agua', 'beber'); // 1.0 ⇒ la única «aprendida» tras el tick
  return vocab;
}

describe('serialización del vocabulario', () => {
  it('roundtrip: serialize → deserialize ⇒ mismo JSON, mismas entradas y stats', () => {
    const original = buildSample();
    const json = original.serialize();

    const restored = new Vocabulary();
    restored.deserialize(json);

    expect(restored.serialize()).toBe(json);
    expect(restored.getStats()).toEqual(original.getStats());
    expect(restored.getStats()).toEqual({ words: 3, learned: 1, total: 4 });

    for (const stimulus of ['manzana', 'color', 'luz', 'beber']) {
      expect(restored.recall(stimulus)).toEqual(original.recall(stimulus));
    }
    expect(restored.getConfig()).toEqual(original.getConfig());
    expect(restored.getNow()).toBe(original.getNow());
  });

  it('tras el roundtrip el comportamiento sigue siendo idéntico (mismos dt ⇒ mismo estado)', () => {
    const original = buildSample();
    const restored = new Vocabulary();
    restored.deserialize(original.serialize());

    original.tick(2.5);
    restored.tick(2.5);
    expect(restored.serialize()).toBe(original.serialize());

    original.teach('verde', 'color');
    restored.teach('verde', 'color');
    expect(restored.serialize()).toBe(original.serialize());
  });

  it('config no por defecto se conserva en el roundtrip', () => {
    const vocab = new Vocabulary({ decayPerSecond: 0.2, learnThreshold: 0.5, boostPerReinforcement: 0.5, maxEntries: 7 });
    vocab.teach('una', 's');
    const restored = new Vocabulary();
    restored.deserialize(vocab.serialize());
    expect(restored.getConfig()).toEqual({
      decayPerSecond: 0.2,
      learnThreshold: 0.5,
      boostPerReinforcement: 0.5,
      maxEntries: 7,
    });
    // Con umbral 0.5, dos refuerzos (0.5+... ) ya es «aprendida».
    vocab.teach('una', 's');
    restored.teach('una', 's');
    expect(restored.recall('s')[0].learned).toBe(true);
    expect(restored.serialize()).toBe(vocab.serialize());
  });

  it('saneado: JSON no válido, schemaVersion desconocida y campos rotos ⇒ RangeError', () => {
    const vocab = new Vocabulary();
    expect(() => vocab.deserialize('esto no es json {')).toThrow(RangeError);
    expect(() => vocab.deserialize('[]')).toThrow(RangeError);
    expect(() => vocab.deserialize('"string"')).toThrow(RangeError);

    const good = JSON.parse(vocab.serialize()) as Record<string, unknown>;
    expect(() => vocab.deserialize(JSON.stringify({ ...good, schemaVersion: VOCAB_SCHEMA_VERSION + 1 }))).toThrow(
      RangeError,
    );
    expect(() => vocab.deserialize(JSON.stringify({ ...good, now: -1 }))).toThrow(RangeError);
    expect(() =>
      vocab.deserialize(JSON.stringify({ ...good, entries: [{ word: '', stimulusId: 's' }] })),
    ).toThrow(RangeError);
    expect(() => (vocab as unknown as { deserialize(x: number): void }).deserialize(42)).toThrow(RangeError);

    // Un JSON roto no deja el vocabulario a medias: el estado sigue intacto.
    expect(vocab.getStats()).toEqual({ words: 0, learned: 0, total: 0 });
  });
});
