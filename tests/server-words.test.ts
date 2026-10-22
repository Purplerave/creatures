/**
 * Tests del filtro de palabras del servidor (S2): normalización, longitud,
 * caracteres y lista de bloqueo — a nivel unidad y por HTTP (400).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './helpers/no-proxy';
import { createNiloServer, type NiloServerHandle } from '../src/server/index';
import {
  MAX_PUBLIC_WORD_LENGTH,
  PUBLIC_WORD_BLOCKLIST,
  filterPublicWord,
  normalizePublicWord,
} from '../src/server/words';

describe('filtro de palabras — unidad', () => {
  it('normaliza: NFKC + trim + espacios colapsados + minúsculas', () => {
    expect(normalizePublicWord('  HOLA   Mundo ')).toBe('hola mundo');
    expect(normalizePublicWord('NIÑO X')).toBe('niño x'.normalize('NFKC'));
    expect(normalizePublicWord(' Acentos ')).toBe('acentos');
  });

  it('acepta palabras normales en español', () => {
    const ok = filterPublicWord('Pelota');
    expect(ok.ok).toBe(true);
    expect(ok.word).toBe('pelota');
    expect(filterPublicWord('mamá').ok).toBe(true);
    expect(filterPublicWord("l'illa").ok).toBe(true);
    expect(filterPublicWord('bien-hecho').ok).toBe(true);
  });

  it('rechaza vacías, demasiado cortas y demasiado largas', () => {
    expect(filterPublicWord('')).toEqual({ ok: false, reason: 'vacia' });
    expect(filterPublicWord('   ')).toEqual({ ok: false, reason: 'vacia' });
    expect(filterPublicWord(42)).toEqual({ ok: false, reason: 'vacia' });
    expect(filterPublicWord(undefined)).toEqual({ ok: false, reason: 'vacia' });
    expect(filterPublicWord('a')).toEqual({ ok: false, reason: 'demasiado_corta' });
    const long = 'a'.repeat(MAX_PUBLIC_WORD_LENGTH + 1);
    expect(filterPublicWord(long)).toEqual({ ok: false, reason: 'demasiado_larga' });
    expect(filterPublicWord('a'.repeat(MAX_PUBLIC_WORD_LENGTH)).ok).toBe(true);
  });

  it('rechaza números y símbolos (solo letras, marcas, espacios, apóstrofes y guiones)', () => {
    expect(filterPublicWord('hola123')).toEqual({ ok: false, reason: 'caracteres_no_validos' });
    expect(filterPublicWord('hola!')).toEqual({ ok: false, reason: 'caracteres_no_validos' });
    expect(filterPublicWord('<script>')).toEqual({ ok: false, reason: 'caracteres_no_validos' });
    expect(filterPublicWord('$aludo')).toEqual({ ok: false, reason: 'caracteres_no_validos' });
    expect(filterPublicWord('DROP; TABLE')).toEqual({ ok: false, reason: 'caracteres_no_validos' });
    // Varios espacios sí se permiten («buenos días»): la seguridad de la
    // consulta va por parámetros parametrizados, no por este filtro.
    expect(filterPublicWord('DROP TABLE').ok).toBe(true);
  });

  it('la lista de bloqueo ignora acentos y mayúsculas', () => {
    expect(filterPublicWord('IDIOTA')).toEqual({ ok: false, reason: 'bloqueada' });
    expect(filterPublicWord('IdIoTa')).toEqual({ ok: false, reason: 'bloqueada' });
    expect(filterPublicWord('mierda')).toEqual({ ok: false, reason: 'bloqueada' });
    // Una palabra que contenga el insulto pero no coincida exactamente se acepta
    // (lista mínima: comparación exacta, documentada).
    expect(filterPublicWord('idiotez').ok).toBe(true);
    expect(PUBLIC_WORD_BLOCKLIST.length).toBeGreaterThan(0);
    for (const word of PUBLIC_WORD_BLOCKLIST) expect(filterPublicWord(word).ok).toBe(false);
  });
});

describe('filtro de palabras — HTTP (POST /api/gesture)', () => {
  let handle: NiloServerHandle;
  let base: string;

  beforeAll(async () => {
    handle = createNiloServer({ dbPath: null, start: false, rateLimitMs: 0, log: null });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  async function post(body: unknown): Promise<Response> {
    return fetch(`${base}/api/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('enseña una palabra válida normalizada (202)', async () => {
    const res = await post({ kind: 'teach', word: '  HOLA   Nilo ' });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; kind: string };
    expect(body).toMatchObject({ status: 'encolado', kind: 'teach' });
    expect(handle.queueSize).toBe(1);
  });

  it('rechaza palabras bloqueadas, largas o con símbolos (400 con motivo)', async () => {
    const blocked = await post({ kind: 'teach', word: 'idiota' });
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toMatchObject({ error: 'palabra_rechazada', motivo: 'bloqueada' });

    const long = await post({ kind: 'teach', word: 'a'.repeat(40) });
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: 'palabra_rechazada', motivo: 'demasiado_larga' });

    const symbols = await post({ kind: 'teach', word: 'hola!!!' });
    expect(symbols.status).toBe(400);
    expect(await symbols.json()).toMatchObject({ error: 'palabra_rechazada', motivo: 'caracteres_no_validos' });

    const missing = await post({ kind: 'teach' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: 'palabra_rechazada' });
  });

  it('rechaza kind desconocido y JSON inválido (400)', async () => {
    const badKind = await post({ kind: 'abrazar' });
    expect(badKind.status).toBe(400);
    expect(await badKind.json()).toMatchObject({ error: 'kind_invalido' });

    const badJson = await fetch(`${base}/api/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{esto no es json',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ error: 'json_invalido' });
  });

  it('las palabras rechazadas NO llegan a la cola', async () => {
    const before = handle.queueSize;
    await post({ kind: 'teach', word: 'mierda' });
    expect(handle.queueSize).toBe(before);
  });

  it('enseñar varias veces hace que la palabra se ALCE como aprendida (learnedToday)', async () => {
    // 4 enseñanzas (3 no bastan con el olvido en marcha) con cola drenada a mano.
    for (let i = 0; i < 4; i += 1) {
      const res = await post({ kind: 'teach', word: 'HOLA' });
      expect(res.status).toBe(202);
    }
    let guard = 0;
    while (handle.queueSize > 0 && guard < 300) {
      handle.stepOnce();
      guard += 1;
    }
    expect(handle.queueSize).toBe(0);
    expect(guard).toBeLessThan(300);

    const snapshot = handle.getSnapshot();
    expect(snapshot.learnedToday).toContain('hola');
    expect(snapshot.diary.some((entry) => entry.kind === 'learn' && entry.text.includes('«hola»'))).toBe(true);
  });
});
