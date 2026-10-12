/**
 * Aprendizaje por refuerzo: 1 teach = 0.34, 3 teaches = 1.0 y «aprendida»,
 * y la misma palabra a otro estímulo es una entrada aparte.
 */
import { describe, expect, it } from 'vitest';
import { Vocabulary } from '../src/vocab/vocabulary';

describe('aprendizaje de palabras', () => {
  it('1 teach → confianza 0.34, no aprendida', () => {
    const vocab = new Vocabulary();
    vocab.teach('comida', 'objeto:manzana');
    const [entry] = vocab.recall('objeto:manzana');
    expect(entry.word).toBe('comida');
    expect(entry.reps).toBe(1);
    expect(entry.confidence).toBeCloseTo(0.34, 10);
    expect(entry.learned).toBe(false);
    expect(vocab.getStats()).toEqual({ words: 1, learned: 0, total: 1 });
  });

  it('2 teaches → 0.68 (aún no aprendida); 3 teaches → 1.0 (recorte) y learned', () => {
    const vocab = new Vocabulary();
    vocab.teach('pelota', 'juego');
    vocab.teach('pelota', 'juego');
    expect(vocab.recall('juego')[0].confidence).toBeCloseTo(0.68, 10);
    expect(vocab.recall('juego')[0].learned).toBe(false);

    vocab.teach('pelota', 'juego');
    const entry = vocab.recall('juego')[0];
    expect(entry.reps).toBe(3);
    expect(entry.confidence).toBe(1); // 3·0.34 = 1.02 → clamp a 1
    expect(entry.learned).toBe(true);
    expect(vocab.getStats()).toEqual({ words: 1, learned: 1, total: 1 });
  });

  it('la confianza nunca supera 1 por mucho que se refuerce', () => {
    const vocab = new Vocabulary();
    for (let i = 0; i < 10; i++) vocab.teach('hola', 'saludo');
    const entry = vocab.recall('saludo')[0];
    expect(entry.confidence).toBe(1);
    expect(entry.reps).toBe(10);
    expect(entry.learned).toBe(true);
  });

  it('misma palabra a otro estímulo = entrada aparte (contadores independientes)', () => {
    const vocab = new Vocabulary();
    vocab.teach('verde', 'color');
    vocab.teach('verde', 'objeto:hoja');
    vocab.teach('verde', 'objeto:hoja');
    vocab.teach('verde', 'objeto:hoja');

    const color = vocab.recall('color');
    const hoja = vocab.recall('objeto:hoja');
    expect(color).toHaveLength(1);
    expect(hoja).toHaveLength(1);
    expect(color[0].confidence).toBeCloseTo(0.34, 10);
    expect(color[0].learned).toBe(false);
    expect(hoja[0].confidence).toBe(1);
    expect(hoja[0].learned).toBe(true);

    // Una tercera estímulo no toca a las otras dos.
    vocab.teach('verde', 'color');
    expect(vocab.recall('color')[0].confidence).toBeCloseTo(0.68, 10);
    expect(vocab.getStats()).toEqual({ words: 1, learned: 1, total: 2 });
  });

  it('normaliza la palabra: «  Pelota  » y «pelota» son la misma entrada', () => {
    const vocab = new Vocabulary();
    vocab.teach('  Pelota ', 'juego');
    vocab.teach('pelota', 'juego');
    const entry = vocab.recall('juego')[0];
    expect(entry.word).toBe('pelota');
    expect(entry.reps).toBe(2);
    expect(vocab.getStats().total).toBe(1);
  });

  it('recall sin entradas ⇒ [] y una palabra inválida ⇒ RangeError', () => {
    const vocab = new Vocabulary();
    expect(vocab.recall('nada')).toEqual([]);
    expect(() => vocab.teach('   ', 'estimulo')).toThrow(RangeError);
    expect(() => vocab.teach('palabra', '  ')).toThrow(RangeError);
  });
});
