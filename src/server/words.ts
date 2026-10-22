/**
 * Filtro de palabras del SERVIDOR (S2, PLAN-PUBLICO §3).
 *
 * «En cliente no vale»: aquí se normaliza y se valida lo que la casa puede
 * enseñarle a Nilo antes de que toque el vocabulario. Reglas, en orden:
 *
 *  1. Normalización: NFKC + trim + espacios colapsados + minúsculas
 *     (la misma normalización que aplica `Vocabulary.normalizeWord`).
 *  2. Longitud: 2–24 caracteres (`MAX_PUBLIC_WORD_LENGTH`).
 *  3. Caracteres: solo letras (Unicode), marcas combinantes, espacios,
 *     apóstrofes y guiones. Sin números ni símbolos.
 *  4. Lista mínima de bloqueo: comparada SIN acentos ni mayúsculas.
 *
 * Devuelve un resultado con motivo en lugar de lanzar: el llamante decide el
 * código HTTP (400). Determinista: cero aleatoriedad.
 */

/** Longitud máxima de una palabra pública (caracteres Unicode). */
export const MAX_PUBLIC_WORD_LENGTH = 24;
/** Longitud mínima: una letra suelta no es una palabra. */
export const MIN_PUBLIC_WORD_LENGTH = 2;

/**
 * Lista mínima de bloqueo (insultos/amenazas evidentes, en minúsculas y sin
 * acentos). Es la semilla v1: crece con cada caso real que llegue al filtro.
 */
export const PUBLIC_WORD_BLOCKLIST: readonly string[] = [
  'idiota',
  'imbecil',
  'estupido',
  'tonto',
  'basura',
  'mierda',
  'puta',
  'puto',
  'carajo',
  'matar',
  'muere',
  'odio',
  'fuck',
  'shit',
  'ass',
];

const BLOCKLIST = new Set(PUBLIC_WORD_BLOCKLIST);

/** Resultado del filtro: `word` solo existe si `ok`. */
export interface WordFilterResult {
  ok: boolean;
  /** Palabra normalizada lista para `Vocabulary.teach()`. */
  word?: string;
  /** Motivo del rechazo (para el cuerpo 400). */
  reason?: 'vacia' | 'demasiado_corta' | 'demasiado_larga' | 'caracteres_no_validos' | 'bloqueada';
}

/** Pasa la palabra por NFKC, trim, colapso de espacios y minúsculas. */
export function normalizePublicWord(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Forma «plana» para comparar contra la lista de bloqueo (sin acentos/marcas). */
function fold(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const VALID_CHARS = /^[\p{L}\p{M}\s'-]+$/u;

/** Normaliza y valida una palabra pública. Nunca lanza. */
export function filterPublicWord(raw: unknown): WordFilterResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'vacia' };
  const word = normalizePublicWord(raw);
  if (!word) return { ok: false, reason: 'vacia' };
  const length = [...word].length;
  if (length < MIN_PUBLIC_WORD_LENGTH) return { ok: false, reason: 'demasiado_corta' };
  if (length > MAX_PUBLIC_WORD_LENGTH) return { ok: false, reason: 'demasiado_larga' };
  if (!VALID_CHARS.test(word)) return { ok: false, reason: 'caracteres_no_validos' };
  if (BLOCKLIST.has(fold(word))) return { ok: false, reason: 'bloqueada' };
  return { ok: true, word };
}
