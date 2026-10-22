/**
 * Smoke HTTP del servidor headless (S2): `GET /api/snapshot` devuelve JSON
 * con la forma del contrato, `GET /events` sirve SSE con cabeceras correctas,
 * y `POST /api/gesture` responde 202 y el cambio se ve en el stream.
 *
 * Dos servidores reales en puerto efímero: uno con tick encendido (comportamiento
 * de producción) y otro con `start: false` para disparar el tick a mano y
 * comprobar de forma DETERMINISTA el aviso instantáneo del SSE.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './helpers/no-proxy';
import { createNiloServer, type NiloServerHandle } from '../src/server/index';

const CONTRACT_KEYS = [
  'action',
  'day',
  'diary',
  'headline',
  'headlineKind',
  'learnedToday',
  'mood',
  'needs',
  'stage',
  'tick',
].sort();

const MOODS = ['tranquilo', 'contento', 'hambriento', 'cansado', 'inquieto', 'enojado', 'durmiendo'];
const STAGES = ['huevo', 'cria', 'joven', 'adulto'];
const HEADLINE_KINDS = ['learn', 'need', 'growth', 'event', 'none'];

interface SnapshotLike {
  day: number;
  stage: string;
  mood: string;
  headline: string;
  headlineKind: string;
  action: { name: string; guided: boolean } | null;
  needs: { id: string; label: string; adjective: string }[];
  diary: { t: string; text: string; kind: string }[];
  learnedToday: string[];
  tick: number;
}

function assertContract(snapshot: SnapshotLike): void {
  expect(Object.keys(snapshot).sort()).toEqual(CONTRACT_KEYS);
  expect(MOODS).toContain(snapshot.mood);
  expect(STAGES).toContain(snapshot.stage);
  expect(HEADLINE_KINDS).toContain(snapshot.headlineKind);
  expect(typeof snapshot.headline).toBe('string');
  expect(snapshot.headline.length).toBeGreaterThan(0);
  expect(snapshot.needs.length).toBeLessThanOrEqual(3);
  expect(snapshot.needs.length).toBeGreaterThan(0);
  for (const need of snapshot.needs) {
    expect(['lleno', 'normal', 'bajo', 'urgente']).toContain(need.adjective);
    expect(typeof need.label).toBe('string');
  }
  expect(snapshot.diary.length).toBeLessThanOrEqual(8);
  expect(Array.isArray(snapshot.learnedToday)).toBe(true);
  expect(Number.isInteger(snapshot.tick)).toBe(true);
  expect(snapshot.day).toBeGreaterThanOrEqual(1);
}

/** Lector persistente de eventos SSE: permite varias esperas sobre el mismo stream. */
interface SseCursor {
  next(predicate: (snapshot: SnapshotLike) => boolean, timeoutMs?: number): Promise<SnapshotLike>;
  close(): Promise<void>;
}

function openSse(response: Response): SseCursor {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('La respuesta SSE no tiene cuerpo');
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    async next(predicate, timeoutMs = 4000): Promise<SnapshotLike> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Se agotó el plazo esperando un evento SSE válido');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Se agotó el plazo esperando un evento SSE válido')), remaining);
        });
        try {
          const chunk = await Promise.race([reader.read(), timeout]);
          if (timer) clearTimeout(timer);
          if (chunk.done) throw new Error('El stream SSE se cerró antes del evento esperado');
          buffer += decoder.decode(chunk.value, { stream: true });
        } catch (error) {
          if (timer) clearTimeout(timer);
          throw error;
        }
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const dataLine = part.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const snapshot = JSON.parse(dataLine.slice(6)) as SnapshotLike;
          if (predicate(snapshot)) return snapshot;
        }
      }
    },
    async close(): Promise<void> {
      await reader.cancel().catch(() => undefined);
      try {
        reader.releaseLock();
      } catch {
        // El stream ya estaba liberado; se ignora.
      }
    },
  };
}

describe('Servidor MVP — smoke HTTP (tick encendido)', () => {
  let handle: NiloServerHandle;
  let base: string;

  beforeAll(async () => {
    handle = createNiloServer({ dbPath: null, rateLimitMs: 0, log: null });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('GET /api/snapshot → 200 con JSON del contrato y cookie httpOnly', async () => {
    const res = await fetch(`${base}/api/snapshot`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('nilo_id=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const snapshot = (await res.json()) as SnapshotLike;
    assertContract(snapshot);
  });

  it('GET /events → SSE con cabeceras y primer snapshot válido', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/events`, { signal: controller.signal });
    const sse = openSse(res);
    try {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toContain('no-cache');
      expect(res.headers.get('x-accel-buffering')).toBe('no');
      expect(handle.clientCount).toBe(1);

      const first = await sse.next(() => true, 3000);
      assertContract(first);
      expect(first.tick).toBeGreaterThanOrEqual(0);
    } finally {
      await sse.close();
      controller.abort();
    }
  });

  it('GET con método desconocido y ruta inexistente → 404 JSON', async () => {
    const res = await fetch(`${base}/no-existe`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'no_existe' });
  });
});

describe('Servidor MVP — gesto 202 + aviso instantáneo en SSE', () => {
  let handle: NiloServerHandle;
  let base: string;

  beforeAll(async () => {
    // Sin tick automático: el test dispara `stepOnce()` para ser determinista.
    handle = createNiloServer({ dbPath: null, rateLimitMs: 0, start: false, log: null });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('POST /api/gesture → 202 y el cambio de titular llega por SSE en el próximo tick', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/events`, { signal: controller.signal });
    const sse = openSse(res);
    try {
      expect(res.status).toBe(200);
      expect(handle.clientCount).toBe(1);

      // Estado inicial: nada que contar ⇒ titular de reserva, diario vacío.
      const initial = await sse.next((snapshot) => snapshot.tick === 0, 3000);
      assertContract(initial);
      expect(initial.headlineKind).toBe('none');
      expect(initial.diary).toHaveLength(0);

      const post = await fetch(`${base}/api/gesture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'feed' }),
      });
      expect(post.status).toBe(202);
      expect(await post.json()).toMatchObject({ status: 'encolado', kind: 'feed' });
      expect(handle.queueSize).toBe(1);

      // Un paso de simulación aplica el gesto y avisa al SSE si cambió el titular.
      handle.stepOnce();

      const updated = await sse.next(
        (snapshot) => snapshot.diary.some((entry) => entry.kind === 'care'),
        3000,
      );
      assertContract(updated);
      expect(updated.tick).toBe(1);
      // El gesto «suma» un estímulo y, si el cambio bioquímico fue medible, el
      // aprendizaje guiado dispara además un diario «learn»: la prioridad del
      // titular (learn > event) hace que el resultado válido sea uno de los dos.
      expect(['learn', 'event']).toContain(updated.headlineKind);
      expect(updated.headline).toBeTruthy();
      expect(updated.action).toEqual({ name: 'Buscar comida', guided: true });
      expect(updated.diary.at(-1)?.t).toMatch(/^D1 00:0\d$/);
      expect(handle.queueSize).toBe(0);
    } finally {
      await sse.close();
      controller.abort();
    }
  });
});
