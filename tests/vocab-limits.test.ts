/**
 * Aforo (maxEntries): al superarlo se expulsa la entrada MÁS DÉBIL y las
 * fuertes se quedan; la palabra que se enseña nunca se expulsa.
 */
import { describe, expect, it } from 'vitest';
import { Vocabulary } from '../src/vocab/vocabulary';

describe('límite de entradas (maxEntries)', () => {
  it('al superar maxEntries se evicta la más débil y las fuertes se quedan', () => {
    const vocab = new Vocabulary({ maxEntries: 3 });

    vocab.teach('fuerte', 's1');
    vocab.teach('fuerte', 's1');
    vocab.teach('fuerte', 's1'); // 1.0, learned
    vocab.teach('media', 's2');
    vocab.teach('media', 's2'); // 0.68
    vocab.teach('debil', 's3'); // 0.34 → aforo lleno (3)
    expect(vocab.getStats().total).toBe(3);

    vocab.teach('nueva', 's4'); // 4ª entrada ⇒ evict de la más débil (debil, 0.34)
    const stats = vocab.getStats();
    expect(stats.total).toBe(3);
    expect(vocab.recall('s3')).toEqual([]); // «debil» fuera
    expect(vocab.recall('s1')[0].confidence).toBe(1); // fuertes intactas
    expect(vocab.recall('s2')[0].confidence).toBeCloseTo(0.68, 10);
    expect(vocab.recall('s4')[0].word).toBe('nueva');
  });

  it('con confianzas empatadas gana la expulsión la de menos refuerzos y, a la par, la más antigua', () => {
    const vocab = new Vocabulary({ maxEntries: 3 });
    vocab.teach('a', 's1');
    vocab.teach('b', 's2');
    vocab.teach('c', 's3'); // las tres en 0.34 ⇒ empate; todas con reps=1
    vocab.tick(1); // ninguna cambia relativa
    vocab.teach('d', 's4'); // empate total ⇒ sale la primera insertada (a)
    expect(vocab.recall('s1')).toEqual([]);
    expect(vocab.recall('s2')).toHaveLength(1);
    expect(vocab.recall('s3')).toHaveLength(1);
    expect(vocab.recall('s4')).toHaveLength(1);

    // Ahora «b» acumula más refuerzos ⇒ deja de ser la más débil empatada.
    vocab.teach('b', 's2');
    vocab.teach('b', 's2');
    vocab.teach('e', 's5'); // empate de confianza con c/s4... b (1.0) no sale
    expect(vocab.recall('s2')).toHaveLength(1); // «b» sobrevive
    expect(vocab.getStats().total).toBe(3);
  });

  it('refuerzar una entrada existente no consume aforo', () => {
    const vocab = new Vocabulary({ maxEntries: 2 });
    vocab.teach('una', 's1');
    vocab.teach('dos', 's2');
    for (let i = 0; i < 5; i++) vocab.teach('una', 's1'); // misma clave
    expect(vocab.getStats().total).toBe(2);
    expect(vocab.recall('s1')[0].reps).toBe(6);
    expect(vocab.recall('s2')).toHaveLength(1); // «dos» intacta
  });

  it('maxEntries = 1 siempre queda en una entrada y es la que se acaba de enseñar', () => {
    const vocab = new Vocabulary({ maxEntries: 1 });
    vocab.teach('primera', 's1');
    vocab.teach('segunda', 's2');
    expect(vocab.getStats().total).toBe(1);
    expect(vocab.recall('s1')).toEqual([]);
    expect(vocab.recall('s2')[0].word).toBe('segunda');

    const next = new Vocabulary({ maxEntries: 1 });
    next.teach('x', 's1'); // la única entrada tiene 0.34, no se autocancela
    next.teach('x', 's1');
    expect(next.recall('s1')[0].reps).toBe(2);
    expect(next.getStats().total).toBe(1);
  });

  it('config de aforo inválida ⇒ RangeError', () => {
    expect(() => new Vocabulary({ maxEntries: 0 })).toThrow(RangeError);
    expect(() => new Vocabulary({ maxEntries: 2.5 })).toThrow(RangeError);
    expect(() => new Vocabulary({ decayPerSecond: -0.1 })).toThrow(RangeError);
    expect(() => new Vocabulary({ learnThreshold: 0 })).toThrow(RangeError);
    expect(() => new Vocabulary({ boostPerReinforcement: 2 })).toThrow(RangeError);
  });
});
