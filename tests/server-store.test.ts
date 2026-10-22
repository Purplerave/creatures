/**
 * Tests de persistencia del servidor (S2): roundtrip de `SaveStore`
 * (`node:sqlite`), fallback JSON documentado y restauración completa al
 * reabrir el servidor (checkpoint automático al cerrar y tras hitos).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNiloServer } from '../src/server/index';
import { jsonFallbackPath, openSaveStore } from '../src/server/store';

const workDir = mkdtempSync(join(tmpdir(), 'nilo-store-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('SaveStore — roundtrip (node:sqlite)', () => {
  it('guarda y recupera sobre + extras en la misma transacción', () => {
    const dbPath = join(workDir, 'roundtrip.sqlite');
    const store = openSaveStore(dbPath);
    store.save({ envelope: '{"saveVersion":1,"meta":{}}', extras: JSON.stringify({ tick: 42, diary: [], lastAction: null }) });
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.envelope).toContain('"saveVersion":1');
    expect(JSON.parse(loaded?.extras ?? 'null')).toMatchObject({ tick: 42 });
    store.close();

    // Reabrir: los datos siguen ahí (persistencia real, no solo memoria).
    const reopened = openSaveStore(dbPath);
    expect(reopened.load()?.envelope).toContain('"saveVersion":1');
    reopened.close();
  });

  it('extras null limpia la fila anterior (nada de datos obsoletos)', () => {
    const dbPath = join(workDir, 'extras.sqlite');
    const store = openSaveStore(dbPath);
    store.save({ envelope: 'v1', extras: '{"tick":9}' });
    expect(store.load()?.extras).toBe('{"tick":9}');
    store.save({ envelope: 'v2', extras: null });
    expect(store.load()).toEqual({ envelope: 'v2', extras: null });
    store.close();
  });

  it('base vacía ⇒ load() null (no lanza)', () => {
    const store = openSaveStore(join(workDir, 'empty.sqlite'));
    expect(store.load()).toBeNull();
    store.close();
  });

  it('fallback JSON con el mismo contrato (ruta .json)', () => {
    const jsonPath = jsonFallbackPath(join(workDir, 'fallback.sqlite'));
    const store = openSaveStore(jsonPath);
    store.save({ envelope: 'json-envelope', extras: '{"tick":3}' });
    expect(store.load()).toEqual({ envelope: 'json-envelope', extras: '{"tick":3}' });
    store.close();

    const reopened = openSaveStore(jsonPath);
    expect(reopened.load()?.envelope).toBe('json-envelope');
    reopened.close();
  });
});

describe('Servidor — checkpoint y restauración', () => {
  it('cierra con checkpoint y el servidor nuevo arranca donde acabó', async () => {
    const dbPath = join(workDir, 'session.sqlite');

    const first = createNiloServer({ dbPath, start: false, log: null });
    // 610 pasos × 0,1 s = 61 s simulados ⇒ cruza el día 2 (60 s) y deja el
    // hito «Empieza el día 2» entre las últimas entradas visibles del diario.
    for (let i = 0; i < 610; i += 1) first.stepOnce();
    const snapshotBefore = first.getSnapshot();
    expect(snapshotBefore.tick).toBe(610);
    expect(snapshotBefore.day).toBeGreaterThanOrEqual(2);
    const growth = snapshotBefore.diary.filter((entry) => entry.kind === 'growth');
    expect(growth.length).toBeGreaterThanOrEqual(1);
    expect(growth.at(-1)?.text).toMatch(/Empieza el día \d+/);
    const diaryTexts = snapshotBefore.diary.map((entry) => entry.text);
    await first.close();

    const second = createNiloServer({ dbPath, start: false, log: null });
    const snapshotAfter = second.getSnapshot();
    expect(snapshotAfter.tick).toBe(610);
    expect(snapshotAfter.day).toBe(snapshotBefore.day);
    expect(snapshotAfter.stage).toBe(snapshotBefore.stage);
    expect(snapshotAfter.diary.map((entry) => entry.text)).toEqual(diaryTexts);
    expect(snapshotAfter.action).toEqual(snapshotBefore.action);
    await second.close();
  });

  it('un guardado ilegible no tumbo el arranjo: arranca de cero', async () => {
    const dbPath = join(workDir, 'corrupt.sqlite');
    const store = openSaveStore(dbPath);
    store.save({ envelope: 'esto no es un sobre válido', extras: null });
    store.close();

    const server = createNiloServer({ dbPath, start: false, log: null });
    const snapshot = server.getSnapshot();
    expect(snapshot.tick).toBe(0);
    expect(snapshot.day).toBe(1);
    await server.close();
  });

  it('dbPath null ⇒ sin persistencia pero funciona igual', async () => {
    const server = createNiloServer({ dbPath: null, start: false, log: null });
    server.stepOnce();
    expect(server.getSnapshot().tick).toBe(1);
    expect(() => server.checkpoint()).not.toThrow();
    await server.close();
  });
});
