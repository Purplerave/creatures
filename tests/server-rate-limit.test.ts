/**
 * Tests de rate-limit (429) y cola de gestos (cap 20) del servidor (S2).
 * La cuota por defecto es 1 gesto / 5 s por IP **y** por cookie `nilo_id`;
 * la cola llena también responde 429 con un motivo distinto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './helpers/no-proxy';
import { createNiloServer, type NiloServerHandle } from '../src/server/index';
import { DEFAULT_GESTURE_QUEUE_CAP, DEFAULT_GESTURE_RATE_LIMIT_MS, GestureBoard } from '../src/server/queue';

describe('GestureBoard — unidad (cuota por IP y por cookie)', () => {
  it('por defecto: 1 gesto cada 5 s por IP y por cookie', () => {
    expect(DEFAULT_GESTURE_RATE_LIMIT_MS).toBe(5000);
    expect(DEFAULT_GESTURE_QUEUE_CAP).toBe(20);
    const board = new GestureBoard();
    expect(board.enqueue({ kind: 'feed', ip: '10.0.0.1', clientId: 'a' }, 1_000).status).toBe('encolado');

    // Misma IP, cookie nueva ⇒ bloqueado por IP.
    expect(board.enqueue({ kind: 'feed', ip: '10.0.0.1', clientId: 'b' }, 2_000).status).toBe('rate_limited');
    // IP distinta pero MISMA cookie que a t=1000 ⇒ bloqueado por cookie.
    expect(board.enqueue({ kind: 'play', ip: '10.0.0.2', clientId: 'a' }, 3_000).status).toBe('rate_limited');

    // Los intentos bloqueados NO actualizan contadores: a t=6001 la IP 1 ya
    // esperó 5 s desde t=1000 y 'b' es cookie nueva ⇒ pasa.
    expect(board.enqueue({ kind: 'feed', ip: '10.0.0.1', clientId: 'b' }, 6_001).status).toBe('encolado');
    // La cookie 'a' también cumple su ventana (último uso aceptado t=1000).
    expect(board.enqueue({ kind: 'play', ip: '10.0.0.2', clientId: 'a' }, 6_002).status).toBe('encolado');
  });

  it('la cola es FIFO con capacidad 20', () => {
    const board = new GestureBoard({ rateLimitMs: 0, queueCap: 20 });
    for (let i = 0; i < 20; i += 1) {
      const result = board.enqueue({ kind: 'feed', ip: `ip-${i}`, clientId: `c-${i}` }, 0);
      expect(result.status).toBe('encolado');
    }
    expect(board.size).toBe(20);
    const overflow = board.enqueue({ kind: 'feed', ip: 'ip-x', clientId: 'c-x' }, 0);
    expect(overflow).toEqual({ status: 'cola_llena', cap: 20 });

    const first = board.drain();
    expect(first?.kind).toBe('feed');
    expect(first?.ip).toBe('ip-0');
    expect(board.size).toBe(19);
  });

  it('rateLimitMs/queueCap inválidos lanzan RangeError', () => {
    expect(() => new GestureBoard({ rateLimitMs: -1 })).toThrow(RangeError);
    expect(() => new GestureBoard({ queueCap: 0 })).toThrow(RangeError);
  });
});

describe('POST /api/gesture — 429 por rate-limit (HTTP)', () => {
  let handle: NiloServerHandle;
  let base: string;

  beforeAll(async () => {
    handle = createNiloServer({ dbPath: null, start: false, log: null });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  function post(body: unknown, cookie?: string): Promise<Response> {
    return fetch(`${base}/api/gesture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('el primer gesto responde 202 y el segundo 429 con Retry-After', async () => {
    const first = await post({ kind: 'feed' });
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { status: string; cola: number };
    expect(firstBody.status).toBe('encolado');
    expect(firstBody.cola).toBe(1);
    expect(handle.queueSize).toBe(1);

    const second = await post({ kind: 'play' });
    expect(second.status).toBe(429);
    const secondBody = (await second.json()) as { error: string; retryAfterMs: number };
    expect(secondBody.error).toBe('rate_limit');
    expect(secondBody.retryAfterMs).toBeGreaterThan(0);
    expect(secondBody.retryAfterMs).toBeLessThanOrEqual(5000);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    // El segundo gesto NO entra en la cola.
    expect(handle.queueSize).toBe(1);
  });

  it('la cuota sigue vigente en la ventana de 5 s (misma IP)', async () => {
    // Nota: por HTTP desde una máquina solo se puede ejercitar la dimensión IP
    // (la dimensión cookie está cubierta en el test unitario de GestureBoard).
    const res = await post({ kind: 'rest' }, 'nilo_id=11111111-2222-3333-4444-555555555555');
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'rate_limit' });
  });
});

describe('POST /api/gesture — cola llena (HTTP)', () => {
  let handle: NiloServerHandle;
  let base: string;

  beforeAll(async () => {
    handle = createNiloServer({ dbPath: null, start: false, rateLimitMs: 0, queueCap: 5, log: null });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('acepta hasta el aforo y devuelve 429 cola_llena después', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${base}/api/gesture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'feed' }),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { cola: number };
      expect(body.cola).toBe(i + 1);
    }
    expect(handle.queueSize).toBe(5);

    const overflow = await fetch(`${base}/api/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'play' }),
    });
    expect(overflow.status).toBe(429);
    expect(await overflow.json()).toMatchObject({ error: 'cola_llena', cap: 5 });
    expect(handle.queueSize).toBe(5);
  });

  it('el gesto espera en la cola si el mundo aún no lo acepta (FIFO)', async () => {
    const before = handle.queueSize;
    expect(before).toBe(5);

    // Primer paso: el comedero está libre ⇒ el gesto de la cabecera se aplica
    // y sale de la cola (1 gesto como máximo por tick).
    handle.stepOnce();
    expect(handle.queueSize).toBe(4);

    // Los siguientes pasos NO vacían la cola: el comedero está en enfriamiento
    // (1,5 s) y el gesto siguiente espera su turno en vez de perderse.
    for (let i = 0; i < 5; i += 1) handle.stepOnce();
    expect(handle.queueSize).toBe(4);

    // En cuanto expira el enfriamiento, entra el siguiente (la cola no se atasca).
    let steps = 0;
    while (handle.queueSize === 4 && steps < 40) {
      handle.stepOnce();
      steps += 1;
    }
    expect(handle.queueSize).toBe(3);
    expect(steps).toBeLessThanOrEqual(20);
    expect(handle.getSnapshot().tick).toBe(1 + 5 + steps);
  });
});
