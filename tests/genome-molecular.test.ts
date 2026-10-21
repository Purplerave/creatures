/**
 * Tests de la capa molecular NCBI 64→20 (`src/genome/molecular.ts`) y de la
 * neuromodulación dopaminérgica O(1) (`src/brain/reward.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  CODON_TABLE,
  computeProteinFingerprint,
  encodeAllelesToOrf,
  mutateDnaBase,
  synonymousCodonsFor,
  translateCodon,
  translateDna,
} from '../src/genome';
import { neuromodulatedReward } from '../src/brain/reward';

describe('capa molecular NCBI 64→20 (F4)', () => {
  it('traduce la tabla estándar de 64 codones con codón de inicio y parada exactos', () => {
    expect(CODON_TABLE).toHaveLength(64);
    expect(translateCodon('ATG')).toBe('M');
    expect(translateCodon('TGG')).toBe('W');
    expect(translateCodon('TTT')).toBe('F');
    expect(translateCodon('TTC')).toBe('F');
    expect(translateCodon('TAA')).toBe('*');
    expect(translateCodon('TAG')).toBe('*');
    expect(translateCodon('TGA')).toBe('*');
    expect(translateDna('ATG-GTT-GTC-GTA-GTG-TAA')).toBe('MVVVV');
  });

  it('demuestra mutaciones sinónimas neutras reales: cambia el ADN pero no la proteína', () => {
    const valineCodons = synonymousCodonsFor('GTT');
    expect(valineCodons.sort()).toEqual(['GTA', 'GTC', 'GTG', 'GTT']);

    const strandA = 'ATG-GTT-GCA-AAA-TAA'; // 3ª base en T, A, A
    const strandB = 'ATG-GTC-GCC-AAG-TAA'; // 3 cambios sinónimos a C, C, G
    const fpA = computeProteinFingerprint(strandA);
    const fpB = computeProteinFingerprint(strandB);

    expect(fpA.aminoAcids).toBe('MVAK');
    expect(fpB.aminoAcids).toBe('MVAK');
    expect(fpA.activity).toBeCloseTo(fpB.activity, 12);
    // Pero la preferencia traduccional Kazusa sí distingue codones C/G frente a A/T.
    expect(fpB.codonFitness).toBeGreaterThan(fpA.codonFitness);
  });

  it('mutateDnaBase clasifica determinísticamente mutaciones sinónimas y missense', () => {
    let sawSynonymous = false;
    let sawMissense = false;
    const baseOrf = encodeAllelesToOrf({ a: 0.2, b: 0.5, c: 0.8, d: 0.9 }, 7, 8);

    for (let seed = 1; seed <= 80; seed++) {
      const outcome = mutateDnaBase(baseOrf, seed);
      expect(outcome.mutatedDna).not.toBe(outcome.previousDna);
      if (outcome.synonymous) sawSynonymous = true;
      else if (!outcome.nonsense) sawMissense = true;
    }

    expect(sawSynonymous).toBe(true);
    expect(sawMissense).toBe(true);
  });

  it('neuromodulatedReward aplica RPE (Schultz 1997) escalado por dopamina O(1)', () => {
    expect(neuromodulatedReward(0.4, 0.0, 0.4)).toBe(0); // recompensa exactamente esperada ⇒ δ = 0
    expect(neuromodulatedReward(0.5, 1.0, 0.1)).toBeGreaterThan(neuromodulatedReward(0.5, 0.0, 0.1));
    expect(neuromodulatedReward(5, 1)).toBe(1);
    expect(neuromodulatedReward(-5, 1)).toBe(-1);
    expect(() => neuromodulatedReward(Number.NaN, 0.5)).toThrow(RangeError);
  });
});
