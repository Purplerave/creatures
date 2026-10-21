/**
 * Capa molecular del genoma (F4 «Super Bestia» — `docs/VISION-SUPER-BESTIA.md` §2).
 *
 * Implementa el código genético estándar real (NCBI Translation Table 1):
 *   - 64 codones indexados en `Uint8Array(64)` (`base1 << 4 | base2 << 2 | base3`),
 *     con traducción `O(N/3)` en sub-milisegundos.
 *   - Degeneración natural del código genético (p. ej. `GTT`, `GTC`, `GTA`, `GTG`
 *     codifican todos `Val`), regalando **mutaciones sinónimas neutras** reales
 *     (ADN cuya secuencia cambia sin alterar la proteína ni el fenotipo) además de
 *     mutaciones no sinónimas (*missense*).
 *   - Huella biofísica por ventana deslizante (`computeProteinFingerprint`) basada
 *     en hidrofobicidad normalizada de Kyte-Doolittle, carga electrostática y
 *     volumen lateral, proyectada determinísticamente a `[0, 1]`.
 */
import { mulberry32, normalizeSeed } from './prng';

/** Alfabeto de nucleótidos en orden canónico de 2 bits (`T=0, C=1, A=2, G=3`). */
export const NUCLEOTIDES = ['T', 'C', 'A', 'G'] as const;
export type Nucleotide = (typeof NUCLEOTIDES)[number];

/** 20 aminoácidos proteogénicos estándar + codón de parada `*` (índice 20). */
export const AMINO_ACIDS = [
  'F', 'L', 'I', 'M', 'V',
  'S', 'P', 'T', 'A', 'Y',
  'H', 'Q', 'N', 'K', 'D',
  'E', 'C', 'W', 'R', 'G',
  '*',
] as const;

export type AminoAcidCode = (typeof AMINO_ACIDS)[number];

export const STOP_AMINO_INDEX = 20;

/**
 * Tabla estándar NCBI 1 en orden exacto `TCAG × TCAG × TCAG` (64 codones):
 *   TTT F, TTC F, TTA L, TTG L, TCT S, TCC S, TCA S, TCG S,
 *   TAT Y, TAC Y, TAA *, TAG *, TGT C, TGC C, TGA *, TGG W, ...
 */
const NCBI_TABLE_1_STRING =
  'FFLLSSSSYY**CC*W' +
  'LLLLPPPPHHQRRRRR'.replace('RRRRR', 'QRRRR') +
  'IIIMTTTTNNKKSSRR' +
  'VVVVAAAADDEEGGGG';

/** Tabla `Uint8Array(64)` precalculada una sola vez al cargar el módulo. */
export const CODON_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const symbol = NCBI_TABLE_1_STRING[i] as AminoAcidCode;
    const aaIndex = AMINO_ACIDS.indexOf(symbol);
    table[i] = aaIndex >= 0 ? aaIndex : STOP_AMINO_INDEX;
  }
  return table;
})();

/** Propiedades físico-químicas normalizadas `[hidropatía, carga, volumen]` en `0..1` por residuo. */
const RESIDUE_PROPERTIES: ReadonlyArray<readonly [number, number, number]> = [
  [0.81, 0.5, 0.78], // F
  [0.92, 0.5, 0.67], // L
  [1.0, 0.5, 0.67],  // I
  [0.71, 0.5, 0.66], // M
  [0.97, 0.5, 0.54], // V
  [0.41, 0.5, 0.24], // S
  [0.32, 0.5, 0.41], // P
  [0.42, 0.5, 0.39], // T
  [0.7, 0.5, 0.24],  // A
  [0.36, 0.5, 0.81], // Y
  [0.14, 0.75, 0.61], // H
  [0.11, 0.5, 0.56], // Q
  [0.11, 0.5, 0.43], // N
  [0.07, 1.0, 0.68], // K
  [0.11, 0.0, 0.4],  // D
  [0.11, 0.0, 0.53], // E
  [0.78, 0.5, 0.36], // C
  [0.4, 0.5, 1.0],   // W
  [0.0, 1.0, 0.73],  // R
  [0.46, 0.5, 0.0],  // G
  [0.5, 0.5, 0.5],   // *
];

/** Pesos Kazusa simplificados (preferencia de uso de codones sinónimos, `0..1`). */
const CODON_USAGE_FITNESS: Float32Array = (() => {
  const weights = new Float32Array(64);
  for (let idx = 0; idx < 64; idx++) {
    const wobble = idx & 0b11; // T=0, C=1, A=2, G=3
    weights[idx] = wobble === 1 || wobble === 3 ? 1.0 : 0.78;
  }
  return weights;
})();

export interface ProteinFingerprint {
  aminoAcids: string;
  length: number;
  hydropathy: number;
  chargeBalance: number;
  stericBulk: number;
  /** Actividad funcional normalizada `0..1` derivada de la huella proteica. */
  activity: number;
  /** Salud traduccional media por uso de codones (`0..1`). */
  codonFitness: number;
}

export interface PointMutationOutcome {
  previousDna: string;
  mutatedDna: string;
  position: number;
  previousCodon: string;
  mutatedCodon: string;
  previousAminoAcid: AminoAcidCode;
  mutatedAminoAcid: AminoAcidCode;
  /** `true` si la mutación cambió el ADN sin cambiar el aminoácido codificado. */
  synonymous: boolean;
  /** `true` si introdujo un codón de parada prematuro. */
  nonsense: boolean;
}

function baseToBits(ch: string): number {
  switch (ch) {
    case 'T':
    case 'U':
      return 0;
    case 'C':
      return 1;
    case 'A':
      return 2;
    case 'G':
      return 3;
    default:
      throw new RangeError(`Nucleótido inválido: «${ch}» (se esperaba A, C, G, T o U)`);
  }
}

/** Limpia separadores visuales y valida una hebra codificante 5′→3′. */
export function sanitizeDna(raw: string): string {
  if (typeof raw !== 'string') throw new RangeError('La secuencia de ADN debe ser un string');
  const cleaned = raw.toUpperCase().replace(/[\s·\-_]/g, '').replace(/U/g, 'T');
  for (let i = 0; i < cleaned.length; i++) {
    baseToBits(cleaned[i]!);
  }
  return cleaned;
}

/** Convierte un triplete de 3 bases a su índice `0..63` en `O(1)`. */
export function codonIndex(codon: string): number {
  if (codon.length !== 3) throw new RangeError(`Codón de longitud inválida: «${codon}»`);
  return (baseToBits(codon[0]!) << 4) | (baseToBits(codon[1]!) << 2) | baseToBits(codon[2]!);
}

/** Traduce un único codón a su aminoácido NCBI (`F`..`G` o `*`). */
export function translateCodon(codon: string): AminoAcidCode {
  const idx = codonIndex(codon.toUpperCase());
  return AMINO_ACIDS[CODON_TABLE[idx]!] ?? '*';
}

/**
 * Traduce una secuencia de ADN en `O(N/3)` usando `CODON_TABLE` (`Uint8Array`).
 * Si `stopAtTerminator` es `true` (por defecto), detiene la traducción al primer `*`.
 */
export function translateDna(dna: string, stopAtTerminator = true): string {
  const clean = sanitizeDna(dna);
  const codons = Math.floor(clean.length / 3);
  const chars: string[] = [];
  for (let c = 0; c < codons; c++) {
    const offset = c * 3;
    const idx =
      (baseToBits(clean[offset]!) << 4) |
      (baseToBits(clean[offset + 1]!) << 2) |
      baseToBits(clean[offset + 2]!);
    const aa = CODON_TABLE[idx]!;
    if (aa === STOP_AMINO_INDEX) {
      if (stopAtTerminator) break;
      chars.push('*');
    } else {
      chars.push(AMINO_ACIDS[aa]!);
    }
  }
  return chars.join('');
}

/**
 * Calcula la huella biofísica por ventana deslizante de tamaño 3 sobre la
 * secuencia traducida (`5–8 ops/residuo`, `O(N/3)`).
 */
export function computeProteinFingerprint(dna: string): ProteinFingerprint {
  const clean = sanitizeDna(dna);
  const codons = Math.floor(clean.length / 3);
  const aaIndices: number[] = [];
  let fitnessSum = 0;
  let translatedCodons = 0;

  for (let c = 0; c < codons; c++) {
    const offset = c * 3;
    const idx =
      (baseToBits(clean[offset]!) << 4) |
      (baseToBits(clean[offset + 1]!) << 2) |
      baseToBits(clean[offset + 2]!);
    const aa = CODON_TABLE[idx]!;
    fitnessSum += CODON_USAGE_FITNESS[idx]!;
    translatedCodons += 1;
    if (aa === STOP_AMINO_INDEX) break;
    aaIndices.push(aa);
  }

  if (aaIndices.length === 0) {
    return {
      aminoAcids: '',
      length: 0,
      hydropathy: 0.5,
      chargeBalance: 0.5,
      stericBulk: 0.5,
      activity: 0,
      codonFitness: translatedCodons > 0 ? fitnessSum / translatedCodons : 0,
    };
  }

  let hydroSum = 0;
  let chargeSum = 0;
  let bulkSum = 0;
  for (let i = 0; i < aaIndices.length; i++) {
    const prev = RESIDUE_PROPERTIES[aaIndices[Math.max(0, i - 1)]!]!;
    const curr = RESIDUE_PROPERTIES[aaIndices[i]!]!;
    const next = RESIDUE_PROPERTIES[aaIndices[Math.min(aaIndices.length - 1, i + 1)]!]!;
    hydroSum += prev[0] * 0.25 + curr[0] * 0.5 + next[0] * 0.25;
    chargeSum += prev[1] * 0.25 + curr[1] * 0.5 + next[1] * 0.25;
    bulkSum += prev[2] * 0.25 + curr[2] * 0.5 + next[2] * 0.25;
  }

  const inv = 1 / aaIndices.length;
  const hydropathy = hydroSum * inv;
  const chargeBalance = chargeSum * inv;
  const stericBulk = bulkSum * inv;
  const activity = Math.min(
    1,
    Math.max(0, hydropathy * 0.45 + chargeBalance * 0.3 + stericBulk * 0.25),
  );

  return {
    aminoAcids: aaIndices.map((idx) => AMINO_ACIDS[idx]!).join(''),
    length: aaIndices.length,
    hydropathy,
    chargeBalance,
    stericBulk,
    activity,
    codonFitness: translatedCodons > 0 ? fitnessSum / translatedCodons : 1,
  };
}

/** Aplica una mutación puntual determinista en la región codificante y clasifica su efecto. */
export function mutateDnaBase(dna: string, seed: number): PointMutationOutcome {
  const clean = sanitizeDna(dna);
  if (clean.length < 3) {
    throw new RangeError('Se requiere al menos un codón (3 bases) para mutar ADN');
  }
  const rng = mulberry32(normalizeSeed(seed));
  // Respeta el codón de inicio ATG si la secuencia es un ORF largo (> 6 bases).
  const mutableStart = clean.startsWith('ATG') && clean.length >= 9 ? 3 : 0;
  const mutableEnd = clean.length >= 9 ? clean.length - 3 : clean.length;
  const span = Math.max(1, mutableEnd - mutableStart);
  const position = mutableStart + Math.floor(rng() * span);
  const currentBits = baseToBits(clean[position]!);
  const step = 1 + Math.floor(rng() * 3); // 1..3 garantiza base distinta
  const nextBase = NUCLEOTIDES[(currentBits + step) & 0b11]!;

  const mutatedDna = clean.slice(0, position) + nextBase + clean.slice(position + 1);
  const codonStart = position - (position % 3);
  const previousCodon = clean.slice(codonStart, codonStart + 3);
  const mutatedCodon = mutatedDna.slice(codonStart, codonStart + 3);
  const previousAminoAcid = translateCodon(previousCodon);
  const mutatedAminoAcid = translateCodon(mutatedCodon);

  return {
    previousDna: clean,
    mutatedDna,
    position,
    previousCodon,
    mutatedCodon,
    previousAminoAcid,
    mutatedAminoAcid,
    synonymous: previousAminoAcid === mutatedAminoAcid,
    nonsense: previousAminoAcid !== '*' && mutatedAminoAcid === '*',
  };
}

/** Devuelve todos los codones sinónimos que codifican el mismo aminoácido. */
export function synonymousCodonsFor(codon: string): string[] {
  const targetAa = CODON_TABLE[codonIndex(codon.toUpperCase())];
  const matches: string[] = [];
  for (let idx = 0; idx < 64; idx++) {
    if (CODON_TABLE[idx] === targetAa) {
      const b1 = NUCLEOTIDES[(idx >> 4) & 0b11]!;
      const b2 = NUCLEOTIDES[(idx >> 2) & 0b11]!;
      const b3 = NUCLEOTIDES[idx & 0b11]!;
      matches.push(`${b1}${b2}${b3}`);
    }
  }
  return matches;
}

/**
 * Codifica de forma determinista el vector alélico actual de un `Genome` en un
 * marco abierto de lectura real (`5′ ATG-…-TAA 3′`) legible en UI.
 */
export function encodeAllelesToOrf(
  genes: Record<string, number>,
  seed = 0,
  maxCodons = 10,
): string {
  const nonStopCodons: number[] = [];
  for (let idx = 0; idx < 64; idx++) {
    if (CODON_TABLE[idx] !== STOP_AMINO_INDEX) nonStopCodons.push(idx);
  }
  const sortedIds = Object.keys(genes).sort();
  const triplets: string[] = ['ATG'];
  const count = Math.min(sortedIds.length, Math.max(1, maxCodons - 2));
  const wobbleSalt = normalizeSeed(seed);

  for (let i = 0; i < count; i++) {
    const id = sortedIds[i]!;
    const val = Math.min(1, Math.max(0, genes[id] ?? 0.5));
    const slot = Math.min(
      nonStopCodons.length - 1,
      Math.floor(val * (nonStopCodons.length - 1) + ((wobbleSalt >>> (i % 16)) & 1) * 0.5),
    );
    const codonIdx = nonStopCodons[slot]!;
    const b1 = NUCLEOTIDES[(codonIdx >> 4) & 0b11]!;
    const b2 = NUCLEOTIDES[(codonIdx >> 2) & 0b11]!;
    const b3 = NUCLEOTIDES[codonIdx & 0b11]!;
    triplets.push(`${b1}${b2}${b3}`);
  }
  triplets.push('TAA');
  return triplets.join('-');
}
