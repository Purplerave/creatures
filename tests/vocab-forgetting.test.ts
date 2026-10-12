/**
 * Olvido determinista: aprendida → sin refuerzo → los ticks bajan la
 * confianza y `learned` CAE al cruzar el umbral; un teach posterior la
 * recupera. Sin aleatoriedad: mismos dt ⇒ mismo estado.
 */
import { describe, expect, it } from 'vitest';
import { Vocabulary } from '../src/vocab/vocabulary';

describe('olvido (tick)', () => {
  it('learned → sin refuerzo → la confianza decae linealmente y learned cae a false', () => {
    const vocab = new Vocabulary(); // decayPerSecond 0.05, umbral 1.0
    for (let i = 0; i < 3; i++) vocab.teach('agua', 'beber');
    expect(vocab.recall('beber')[0].learned).toBe(true);

    vocab.tick(1);
    const after1 = vocab.recall('beber')[0];
    expect(after1.confidence).toBeCloseTo(1 - 0.05, 10);
    expect(after1.learned).toBe(false); // ya no está en el umbral 1.0

    // El decrecimiento sigue siendo lineal y determinista.
    vocab.tick(1);
    const after2 = vocab.recall('beber')[0];
    expect(after2.confidence).toBeCloseTo(1 - 0.1, 10);
    expect(after2.learned).toBe(false);

    // Hasta llegar a 0 exacto (sin pasar de ella).
    vocab.tick(1000);
    expect(vocab.recall('beber')[0].confidence).toBe(0);
    expect(vocab.recall('beber')[0].learned).toBe(false);
  });

  it('un teach posterior recupera la palabra olvidada', () => {
    const vocab = new Vocabulary();
    for (let i = 0; i < 3; i++) vocab.teach('pelota', 'juego');
    expect(vocab.recall('juego')[0].learned).toBe(true);

    vocab.tick(5); // olvida: 1 − 0.05·5 = 0.75 → no aprendida
    expect(vocab.recall('juego')[0].confidence).toBeCloseTo(0.75, 10);
    expect(vocab.recall('juego')[0].learned).toBe(false);

    vocab.teach('pelota', 'juego'); // refuerzo: 0.75 + 0.34 = 1.0 (clamp)
    const entry = vocab.recall('juego')[0];
    expect(entry.confidence).toBe(1);
    expect(entry.learned).toBe(true);
    expect(entry.reps).toBe(4);
    expect(entry.lastReinforcedAt).toBe(5); // reloj de simulación, no real
  });

  it('el refuerzo reinicia el reloj del olvido: solo decae desde el último teach', () => {
    const vocab = new Vocabulary();
    vocab.teach('luz', 'encender');
    vocab.tick(2); // 0.34 − 0.05·2 = 0.24
    expect(vocab.recall('encender')[0].confidence).toBeCloseTo(0.24, 10);
    vocab.teach('luz', 'encender'); // 0.24 + 0.34 = 0.58, último refuerzo en t=2
    vocab.tick(2); // solo cuenta este tramo: 0.58 − 0.1 = 0.48
    expect(vocab.recall('encender')[0].confidence).toBeCloseTo(0.48, 10);
  });

  it('es determinista: dos instancias con los mismos dt dan idéntico estado serializado', () => {
    const a = new Vocabulary();
    const b = new Vocabulary();
    for (const v of [a, b]) {
      v.teach('uno', 's1');
      v.teach('dos', 's2');
      v.teach('dos', 's2');
      v.tick(1.5);
      v.teach('tres', 's3');
      v.tick(0.25);
    }
    expect(a.serialize()).toBe(b.serialize());
  });

  it('rechaza dt inválido y dt=0 no cambia nada', () => {
    const vocab = new Vocabulary();
    vocab.teach('hola', 'saludo');
    const before = vocab.serialize();
    vocab.tick(0);
    expect(vocab.serialize()).toBe(before);
    expect(() => vocab.tick(-1)).toThrow(RangeError);
    expect(() => vocab.tick(Number.NaN)).toThrow(RangeError);
    expect(() => vocab.tick(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
