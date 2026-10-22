/**
 * Servidor headless de Nilo (S2 · PLAN-PUBLICO §3).
 *
 * «Mismo motor, dos caras»: aquí NO hay DOM. El boot replica el cableado de
 * `src/main.ts` (Genome → BrainV05 → createBrainRuntime → BiochemEngine →
 * Vocabulary → CreatureWorld) y la lógica gesto → estímulo es la compartida de
 * `src/habitat/actions.ts` (extraída de `main.ts` en esta rama).
 *
 * Superficie:
 *   GET  /api/snapshot  → JSON `PublicSnapshot`
 *   GET  /events        → SSE: snapshot cada 2 s + al instante si cambia
 *                         headline/mood
 *   POST /api/gesture   → 202 encola · 429 rate-limit (1/5 s por IP y por
 *                         cookie) o cola llena · 400 validación/filtro
 *
 * Motor: `node:http` puro, tick 10 Hz con acumulador (patrón PR #7),
 * `setInterval(...).unref()`, persistencia `node:sqlite` (checkpoint cada
 * 5 min y tras hitos) con fallback JSON documentado en `./store.ts`.
 * Cero `Math.random()`: todo azar vive en el cerebro (PRNG con semilla).
 *
 * Env: `PORT` (8787), `NILO_DB` (`./nilo.sqlite`), `HOST` (127.0.0.1).
 * Arranque: `npm run server`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import type { BrainOutput } from '../contracts/ibrain';
import type { PublicDiaryEntry, PublicSnapshot } from '../contracts/ipublic';
import { BiochemEngine } from '../biochem';
import { createBrainRuntime, type BrainV05Adapter } from '../brain';
import { BrainV05 } from '../brain/brain-v05';
import { actionFromValue } from '../brain/actions';
import { driveDiscomfort, driveReductionReward } from '../brain/reward';
import { Genome } from '../genome';
import { Vocabulary } from '../vocab';
import { CreatureWorld } from '../world';
import { restoreGameState, resolveLifeStage, serializeGameState } from '../persistence';
import {
  GESTURE_ACTION,
  GESTURE_STIMULUS,
  applyGuidedInteraction,
  brainInputs,
  performGuidedAction,
  worldActionLabel,
  type ActionSource,
  type GestureKind,
  type GuidedActionDeps,
  type GuidedActionOutcome,
} from '../habitat/actions';
import {
  SIM_SECONDS_PER_DAY,
  collectLearnedToday,
  formatSimClock,
  toPublicSnapshot,
} from '../public/snapshot';
import { GestureBoard, type QueuedGesture } from './queue';
import { openSaveStore, type SaveStore } from './store';
import { filterPublicWord } from './words';

/** Misma semilla que el laboratorio: la misma partida, bit a bit. */
export const BRAIN_SEED = 20261012;

/** Estado inicial idéntico al de `src/main.ts`. */
const INITIAL_CHEMICALS: Record<string, number> = {
  glucosa: 0.8,
  adenosina: 0.12,
  dopamina: 0.4,
  cortisol: 0.06,
  oxitocina: 0.24,
  serotonina: 0.3,
};
const INITIAL_DRIVES: Record<string, number> = {
  hambre: 0.22,
  energia: 0.76,
  sueno: 0.18,
  curiosidad: 0.62,
  vinculo: 0.54,
  aburrimiento: 0.2,
  miedo: 0.08,
  confort: 0.68,
};

/** El agente decide y mantiene una acción durante este intervalo simulado. */
const BRAIN_DECISION_INTERVAL = 0.75;
/** Tick de simulación: 10 Hz. */
export const TICK_HZ = 10;
const SIM_STEP_SECONDS = 1 / TICK_HZ;
/** Tope de acumulador tras una parada larga (patrón PR #7). */
const MAX_SIMULATION_BACKLOG_SECONDS = 0.25;
/** Cadencia real del acumulador (ms). */
const TICK_INTERVAL_MS = 50;
/** Cadencia del SSE cuando no hay eventos. */
export const SNAPSHOT_INTERVAL_MS = 2000;
/** Checkpoint automático de persistencia. */
export const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;
/** Máximo de conexiones SSE simultáneas. */
export const MAX_SSE_CLIENTS = 100;
/** Entradas de diario retenidas en memoria (la casa solo ve 8). */
export const DIARY_KEEP = 32;
/** Puerto y base de datos por defecto. */
export const DEFAULT_PORT = 8787;
export const DEFAULT_DB_PATH = './nilo.sqlite';
/** Tamaño máximo del cuerpo de POST /api/gesture. */
const MAX_BODY_BYTES = 8 * 1024;

const COOKIE_NAME = 'nilo_id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GestureKindId = GestureKind;

/** Opciones de `createNiloServer()`. */
export interface NiloServerOptions {
  /** Ruta de la base (`node:sqlite`); `null` desactiva persistencia. */
  dbPath?: string | null;
  /** Ventana de rate-limit de gestos (ms); por defecto 5000. */
  rateLimitMs?: number;
  /** Capacidad de la cola; por defecto 20. */
  queueCap?: number;
  /** Cadencia del SSE periódico (ms); por defecto 2000. */
  snapshotIntervalMs?: number;
  /** Arranca el bucle de tick y los timers (por defecto `true`). */
  start?: boolean;
  /** Canal de log (por defecto `console.log` silenciado en tests: pasa `null`). */
  log?: ((message: string) => void) | null;
}

/** Manejador devuelto por `createNiloServer()`. */
export interface NiloServerHandle {
  server: Server;
  /** Escucha y devuelve el puerto real (útil con `port: 0`). */
  listen(port?: number, host?: string): Promise<number>;
  /** Cierra timers, clientes SSE, store y servidor. */
  close(): Promise<void>;
  /** Snapshot público actual. */
  getSnapshot(): PublicSnapshot;
  /** Un paso de simulación (el bucle de tick los encadena). */
  stepOnce(): void;
  /** Fuerza un checkpoint de persistencia. */
  checkpoint(): void;
  /** Gestos pendientes en la cola. */
  readonly queueSize: number;
  /** Clientes SSE conectados. */
  readonly clientCount: number;
}

/** Extras del servidor que el sobre de `serializeGameState` no conoce. */
interface ServerExtras {
  tick: number;
  diary: PublicDiaryEntry[];
  lastAction: { name: string; guided: boolean } | null;
  /** Palabras que ALCANZARON el umbral de «aprendida» durante el día vigente. */
  learnedToday: string[];
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isValidDiaryEntry(entry: unknown): entry is PublicDiaryEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Partial<PublicDiaryEntry>;
  return (
    typeof candidate.t === 'string' &&
    typeof candidate.text === 'string' &&
    (candidate.kind === 'care' || candidate.kind === 'learn' || candidate.kind === 'growth' || candidate.kind === 'world')
  );
}

/** Crea el servidor headless: motor restaurado/guardado + HTTP/SSE + tick. */
export function createNiloServer(options: NiloServerOptions = {}): NiloServerHandle {
  const log = options.log ?? null;
  const board = new GestureBoard({ rateLimitMs: options.rateLimitMs, queueCap: options.queueCap });
  const snapshotIntervalMs = options.snapshotIntervalMs ?? SNAPSHOT_INTERVAL_MS;

  // ---------------------------------------------------------------- boot ---
  let genome = new Genome();
  let phenotype = genome.getPhenotype({ ageSeconds: 0 });
  let brainModel = new BrainV05({ ...phenotype.brain, seed: BRAIN_SEED });
  let brainRuntime = createBrainRuntime(genome, () => brainModel);
  let actionSpace = brainModel.getActions();
  let engine = new BiochemEngine({
    initialChemicals: INITIAL_CHEMICALS,
    initialDrives: INITIAL_DRIVES,
    phenotype: brainRuntime.phenotype,
  });
  let brain: BrainV05Adapter = brainRuntime.brain;
  let vocabulary = new Vocabulary();
  let world = new CreatureWorld();

  let creatureName = 'Nilo';
  let simTime = 0;
  let frame = 0;
  let tick = 0;
  let diary: PublicDiaryEntry[] = [];
  let lastAction: { name: string; guided: boolean } | null = null;
  let learnedTodayWords = new Set<string>();
  let lastBrainOutput: BrainOutput | null = null;
  let previousDiscomfort = 0;
  let suppressNextAutoReward = false;
  let nextBrainDecision = BRAIN_DECISION_INTERVAL;
  let lastWorldSource: ActionSource = 'brain';
  let milestoneDay = 1;
  let milestoneStage: string | null = null;

  const dbPath = options.dbPath === undefined ? DEFAULT_DB_PATH : options.dbPath;
  const store: SaveStore | null = dbPath ? openSaveStore(dbPath) : null;

  function deps(): GuidedActionDeps {
    return {
      engine,
      world,
      brain,
      brainModel,
      actionSpace,
      getFrame: () => frame,
      // Modo híbrido: los gestos «suman» al instante (sin exigir caminar).
      requireProximity: false,
    };
  }

  function restoreIfAny(): void {
    if (!store) return;
    const data = store.load();
    if (!data) return;
    try {
      const restored = restoreGameState(data.envelope, BRAIN_SEED);
      genome = restored.genome;
      phenotype = genome.getPhenotype({ ageSeconds: restored.meta.simTime });
      brainModel = restored.brainModel;
      brainRuntime = restored.brainRuntime;
      actionSpace = brainModel.getActions();
      engine = restored.engine;
      brain = brainRuntime.brain;
      vocabulary = restored.vocabulary;
      world = restored.world;
      creatureName = restored.meta.creatureName;
      simTime = restored.meta.simTime;
      frame = restored.meta.frame;

      if (data.extras) {
        const extras = JSON.parse(data.extras) as Partial<ServerExtras>;
        tick = Math.max(0, Math.floor(clampNumber(extras.tick, 0)));
        diary = Array.isArray(extras.diary) ? extras.diary.filter(isValidDiaryEntry).slice(-DIARY_KEEP) : [];
        lastAction =
          extras.lastAction && typeof extras.lastAction === 'object' && typeof extras.lastAction.name === 'string'
            ? { name: extras.lastAction.name, guided: Boolean(extras.lastAction.guided) }
            : null;
        learnedTodayWords = new Set(
          Array.isArray(extras.learnedToday)
            ? extras.learnedToday.filter((word): word is string => typeof word === 'string')
            : [],
        );
      }

      const stage = resolveLifeStage(simTime);
      milestoneDay = stage.day;
      milestoneStage = stage.id;
      nextBrainDecision = simTime + BRAIN_DECISION_INTERVAL;
      previousDiscomfort = driveDiscomfort(engine.tick(0).drives);
      lastBrainOutput = brain.think(brainInputs(engine.tick(0), frame));
      log?.(`[nilo] partida restaurada (t=${simTime.toFixed(1)} s, tick ${tick})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.(`[nilo] guardado ilegible, arranco de cero: ${message}`);
    }
  }

  restoreIfAny();
  if (lastBrainOutput === null) {
    const initial = engine.tick(0);
    previousDiscomfort = driveDiscomfort(initial.drives);
    lastBrainOutput = brain.think(brainInputs(initial, frame));
  }
  const initialStage = resolveLifeStage(simTime);
  milestoneDay = initialStage.day;
  milestoneStage = initialStage.id;

  // -------------------------------------------------------------- diario ---
  function pushDiary(kind: PublicDiaryEntry['kind'], text: string): void {
    const day = resolveLifeStage(simTime).day;
    diary.push({ t: formatSimClock(simTime, day), text, kind });
    if (diary.length > DIARY_KEEP) diary.splice(0, diary.length - DIARY_KEEP);
  }

  function actionNameFor(actionId: string): string {
    return worldActionLabel(actionId);
  }

  function checkpoint(): void {
    if (!store) return;
    try {
      const envelope = serializeGameState(
        { genome, engine, brainModel, vocabulary, world },
        { creatureName, simTime, frame, autoReward: true, spatialStrict: false },
      );
      const extras: ServerExtras = { tick, diary, lastAction, learnedToday: [...learnedTodayWords].sort() };
      store.save({ envelope, extras: JSON.stringify(extras) });
      log?.(`[nilo] checkpoint (t=${simTime.toFixed(1)} s, tick ${tick})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.(`[nilo] checkpoint fallido: ${message}`);
    }
  }

  // -------------------------------------------------------------- gestos ---
  /**
   * Intenta aplicar el gesto en la cabecera de la cola.
   * Devuelve `false` si el mundo no lo acepta todavía (objeto en
   * enfriamiento): el gesto ESPERA en la cola en vez de perderse — «suman,
   * no ordenan», pero nunca se tragan.
   */
  function tryApplyGesture(gesture: QueuedGesture): boolean {
    const actionId = GESTURE_ACTION[gesture.kind];
    const outcome = performGuidedAction(deps(), actionId, 'manual');
    if (!outcome.interaction.applied) return false;

    lastWorldSource = 'manual';
    if (gesture.kind === 'teach' && gesture.word) {
      const stimulusId = GESTURE_STIMULUS.teach;
      try {
        vocabulary.teach(gesture.word, stimulusId);
        const entry = vocabulary.recall(stimulusId).find((item) => item.word === gesture.word);
        if (entry?.learned) {
          // `Vocabulary` olvida rápido: registramos el ALCANZAR el umbral
          // («hoy ha aprendido») además del estado vivo del vocabulario.
          learnedTodayWords.add(entry.word);
          pushDiary('learn', `Nilo aprendió «${gesture.word}»`);
        } else {
          pushDiary('care', `Le enseñaron la palabra «${gesture.word}»`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log?.(`[nilo] no se pudo enseñar «${gesture.word}»: ${message}`);
      }
    }
    reflectOutcome(outcome, 'manual');
    return true;
  }

  /** Traslada el resultado del camino guiado al estado público (diario/acción). */
  function reflectOutcome(outcome: GuidedActionOutcome, source: ActionSource): void {
    if (outcome.suppressNextAutoReward) {
      suppressNextAutoReward = true;
      if (outcome.previousDiscomfort !== null) previousDiscomfort = outcome.previousDiscomfort;
    }
    if (outcome.impulseApplied) {
      lastAction = { name: actionNameFor(outcome.interaction.actionId), guided: source === 'manual' };
      pushDiary(source === 'manual' ? 'care' : 'world', outcome.interaction.message);
      const learning = outcome.learning;
      if (learning?.evaluated && learning.learned) {
        pushDiary('learn', `Nilo aprendió a «${learning.category.name}»`);
      }
    }
  }

  // ----------------------------------------------------------- snapshot ----
  function getSnapshot(): PublicSnapshot {
    const engineSnapshot = engine.tick(0);
    const day = resolveLifeStage(simTime).day;
    const learned = new Set([
      ...learnedTodayWords,
      ...collectLearnedToday(vocabulary, (day - 1) * SIM_SECONDS_PER_DAY),
    ]);
    return toPublicSnapshot({
      drives: engineSnapshot.drives,
      simTime,
      tick,
      diary,
      learnedToday: [...learned].sort(),
      action: lastAction,
    });
  }

  // ------------------------------------------------------------- tick ------
  function stepOnce(): void {
    simTime += SIM_STEP_SECONDS;
    frame += 1;
    tick += 1;

    // 1) Un gesto por tick como máximo: FIFO. Si el mundo aún no lo acepta
    //    (enfriamiento del objeto), el gesto queda el primero de la cola.
    const pending = board.peek();
    if (pending && tryApplyGesture(pending)) board.drain();

    // 2) El mundo avance y, si dispara una interacción pendiente, se aplica.
    const step = world.advance(SIM_STEP_SECONDS);
    if (step.triggeredInteraction) {
      reflectOutcome(applyGuidedInteraction(deps(), step.triggeredInteraction, lastWorldSource), lastWorldSource);
    }

    // 3) Motor de bioquímica + olvido del vocabulario.
    const engineSnapshot = engine.tick(SIM_STEP_SECONDS);
    vocabulary.tick(SIM_STEP_SECONDS);
    const discomfort = driveDiscomfort(engineSnapshot.drives);

    // 4) Refuerzo automático + decisión del cerebro (igual que `main.ts`).
    if (simTime >= nextBrainDecision) {
      const skipReward = suppressNextAutoReward;
      suppressNextAutoReward = false;
      const reward = driveReductionReward(previousDiscomfort, discomfort);
      if (!skipReward) brain.reinforce(reward);
      previousDiscomfort = discomfort;

      lastBrainOutput = brain.think(brainInputs(engineSnapshot, frame));
      const selected = actionFromValue(actionSpace, lastBrainOutput.actions[0] ?? 0);
      if (selected) {
        reflectOutcome(performGuidedAction(deps(), selected.action.id, 'brain'), 'brain');
      }
      nextBrainDecision = simTime + BRAIN_DECISION_INTERVAL;
    }

    // 5) Hitos: cambio de día o de etapa ⇒ diario + checkpoint.
    const stage = resolveLifeStage(simTime);
    if (stage.day !== milestoneDay) {
      milestoneDay = stage.day;
      learnedTodayWords = new Set(); // «hoy» se reinicia al cambiar de día
      pushDiary('growth', `Empieza el día ${stage.day}`);
      checkpoint();
    }
    if (stage.id !== milestoneStage) {
      milestoneStage = stage.id;
      const publicLabel = stage.id === 'embrion' ? 'huevo' : stage.id;
      pushDiary('growth', `Nilo ha crecido: ${publicLabel}`);
      checkpoint();
    }

    // 6) Aviso inmediato al SSE si cambia el titular o el humor.
    const snapshot = getSnapshot();
    const key = notificationKey(snapshot);
    if (key !== lastNotifiedKey) {
      lastNotifiedKey = key;
      broadcast(snapshot);
    }
  }

  // -------------------------------------------------------------- HTTP ----
  const sseClients = new Set<ServerResponse>();
  let lastNotifiedKey = '';

  function notificationKey(snapshot: PublicSnapshot): string {
    return `${snapshot.mood}|${snapshot.headlineKind}|${snapshot.headline}`;
  }

  function sendJson(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }

  function writeEvent(res: ServerResponse, snapshot: PublicSnapshot): void {
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  }

  function broadcast(snapshot: PublicSnapshot): void {
    for (const client of sseClients) writeEvent(client, snapshot);
  }

  function readClientId(req: IncomingMessage, res: ServerResponse): string {
    const header = req.headers.cookie;
    if (header) {
      for (const part of header.split(';')) {
        const [rawName, ...rest] = part.trim().split('=');
        if (rawName === COOKIE_NAME) {
          const value = rest.join('=').trim();
          if (UUID_PATTERN.test(value)) return value.toLowerCase();
        }
      }
    }
    const id = randomUUID();
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
    );
    return id;
  }

  function clientIp(req: IncomingMessage): string {
    const address = req.socket.remoteAddress ?? 'unknown';
    return address.startsWith('::ffff:') ? address.slice(7) : address;
  }

  function readJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new RangeError('cuerpo_demasiado_grande'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new SyntaxError('json_invalido'));
        }
      });
      req.on('error', reject);
    });
  }

  function handleSse(req: IncomingMessage, res: ServerResponse): void {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      sendJson(res, 503, { error: 'sse_lleno', max: MAX_SSE_CLIENTS });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    writeEvent(res, getSnapshot());
    req.on('close', () => {
      sseClients.delete(res);
    });
  }

  async function handleGesture(req: IncomingMessage, res: ServerResponse, clientId: string): Promise<void> {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const tooLarge = error instanceof RangeError;
      sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'cuerpo_grande' : 'json_invalido' });
      return;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, { error: 'json_invalido', message: 'Esperaba un objeto { kind, word? }.' });
      return;
    }
    const payload = body as { kind?: unknown; word?: unknown };
    const kind = payload.kind;
    if (kind !== 'feed' && kind !== 'play' && kind !== 'teach' && kind !== 'rest') {
      sendJson(res, 400, { error: 'kind_invalido', permitidos: ['feed', 'play', 'teach', 'rest'] });
      return;
    }

    let word: string | undefined;
    if (kind === 'teach') {
      const filtered = filterPublicWord(payload.word);
      if (!filtered.ok) {
        sendJson(res, 400, { error: 'palabra_rechazada', motivo: filtered.reason });
        return;
      }
      word = filtered.word;
    } else if (typeof payload.word === 'string' && payload.word.trim()) {
      const filtered = filterPublicWord(payload.word);
      if (!filtered.ok) {
        sendJson(res, 400, { error: 'palabra_rechazada', motivo: filtered.reason });
        return;
      }
    }

    const outcome = board.enqueue({ kind: kind as GestureKind, word, ip: clientIp(req), clientId });
    if (outcome.status === 'rate_limited') {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))));
      sendJson(res, 429, { error: 'rate_limit', retryAfterMs: outcome.retryAfterMs });
      return;
    }
    if (outcome.status === 'cola_llena') {
      sendJson(res, 429, { error: 'cola_llena', cap: outcome.cap });
      return;
    }
    log?.(`[nilo] gesto ${kind}${word ? ` «${word}»` : ''} encolado (IP ${clientIp(req)})`);
    sendJson(res, 202, { status: 'encolado', kind, cola: outcome.queueSize });
  }

  function handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const clientId = readClientId(req, res);
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';

    if (req.method === 'GET' && pathname === '/api/snapshot') {
      sendJson(res, 200, getSnapshot());
      return;
    }
    if (req.method === 'GET' && pathname === '/events') {
      handleSse(req, res);
      return;
    }
    if (req.method === 'POST' && pathname === '/api/gesture') {
      void handleGesture(req, res, clientId);
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { Allow: 'GET, POST, OPTIONS' });
      res.end();
      return;
    }
    sendJson(res, 404, { error: 'no_existe', message: `Ruta no encontrada: ${pathname}` });
  }

  const server = createServer(handleRequest);

  // -------------------------------------------------------------- timers ---
  let accumulator = 0;
  let lastTickAt = Date.now();
  const start = options.start !== false;
  const tickTimer = start
    ? setInterval(() => {
        const now = Date.now();
        accumulator = Math.min(
          MAX_SIMULATION_BACKLOG_SECONDS,
          accumulator + Math.max(0, (now - lastTickAt) / 1000),
        );
        lastTickAt = now;
        while (accumulator >= SIM_STEP_SECONDS) {
          accumulator -= SIM_STEP_SECONDS;
          stepOnce();
        }
      }, TICK_INTERVAL_MS)
    : null;
  tickTimer?.unref();

  const snapshotTimer = start
    ? setInterval(() => {
        if (sseClients.size > 0) broadcast(getSnapshot());
      }, snapshotIntervalMs)
    : null;
  snapshotTimer?.unref();

  const checkpointTimer = start ? setInterval(checkpoint, CHECKPOINT_INTERVAL_MS) : null;
  checkpointTimer?.unref();

  // Solo se avisa al SSE si algo cambia (titular o humor); la semilla inicial
  // evita un primer aviso redundante justo al conectar.
  lastNotifiedKey = notificationKey(getSnapshot());

  // ------------------------------------------------------------ manejo -----
  function listen(port: number = DEFAULT_PORT, host = '127.0.0.1'): Promise<number> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    });
  }

  async function close(): Promise<void> {
    if (tickTimer) clearInterval(tickTimer);
    if (snapshotTimer) clearInterval(snapshotTimer);
    if (checkpointTimer) clearInterval(checkpointTimer);
    for (const client of sseClients) client.end();
    sseClients.clear();
    checkpoint();
    store?.close();
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  return {
    server,
    listen,
    close,
    getSnapshot,
    stepOnce,
    checkpoint,
    get queueSize() {
      return board.size;
    },
    get clientCount() {
      return sseClients.size;
    },
  };
}

/** Arranque directo (`npm run server`). */
function run(): void {
  const rawPort = Number(process.env.PORT);
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : DEFAULT_PORT;
  const host = process.env.HOST ?? '127.0.0.1';
  const dbPath = process.env.NILO_DB ?? DEFAULT_DB_PATH;
  const handle = createNiloServer({ dbPath, log: (message) => console.log(message) });
  void handle.listen(port, host).then((bound) => {
    console.log(`[nilo] Nilo escuchando en http://${host}:${bound} · db ${dbPath}`);
  });
  const shutdown = (): void => {
    void handle.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  run();
}
