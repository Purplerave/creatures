/**
 * Coordinador transaccional de persistencia y ciclo de vida (Fase 5).
 *
 * Agrupa en un sobre JSON versionado (`CREATURES_SAVE_VERSION = 1`) los cinco
 * subsistemas del organismo y su entorno:
 *   1. `Genome` (genes, generación, loci duplicados y metilación epigenética).
 *   2. `BiochemEngine` (drives y niveles químicos vivos).
 *   3. `BrainV05` (arquitectura resuelta, pesos sinápticos, ε y tiradas PRNG).
 *   4. `Vocabulary` (asociaciones palabra→estímulo y reloj de olvido).
 *   5. `CreatureWorld` (objetos, enfriamientos, usos y cinemática espacial 2D).
 *
 * Garantía transaccional («todo o nada»):
 *   `restoreGameState()` instancia y valida primero copias en cuarentena de los
 *   cinco subsistemas. Si cualquier sección está corrupta, truncada o fuera de
 *   esquema, lanza `RangeError` sin haber tocado ni un solo campo de la partida
 *   en curso, ni desperdiciar `dispose()` sobre el cerebro vivo.
 */
import { BiochemEngine } from '../biochem';
import { BrainV05, DEFAULT_BRAIN_SEED } from '../brain/brain-v05';
import { createBrainRuntime, type BrainRuntime } from '../brain/runtime';
import { Genome, normalizeSeed, mulberry32 } from '../genome';
import { Vocabulary } from '../vocab';
import { CreatureWorld } from '../world';

/** Versión del sobre de partida completa. */
export const CREATURES_SAVE_VERSION = 1;

/** Máximo de texto JSON aceptado al importar una partida (5 MiB aprox.). */
export const MAX_SAVE_JSON_LENGTH = 5 * 1024 * 1024;
/** Longitud máxima para el nombre visible y el nombre del archivo exportado. */
export const MAX_CREATURE_NAME_LENGTH = 32;

/** Clave de almacenamiento local por defecto en navegador. */
export const DEFAULT_STORAGE_KEY = 'creatures.save.v1';

/** Nombres deterministas para nuevas generaciones al incubar un huevo. */
export const LINEAGE_NAMES = [
  'Nilo',
  'Muna',
  'Tiko',
  'Lumi',
  'Boro',
  'Nara',
  'Kora',
  'Sori',
] as const;

/** Interfaz mínima de almacenamiento clave-valor (compatible con `localStorage` y tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Metadatos de sesión coordinados junto con los módulos biológicos. */
export interface SaveGameMeta {
  creatureName: string;
  simTime: number;
  frame: number;
  autoReward: boolean;
  spatialStrict: boolean;
}

/** Sobre JSON versionado de una partida completa. */
export interface SaveEnvelope {
  saveVersion: number;
  meta: SaveGameMeta;
  modules: {
    genome: string;
    biochem: string;
    brain: string;
    vocabulary: string;
    world: string;
  };
}

/** Conjunto completo de instancias vivas de una sesión. */
export interface GameSessionBundle {
  genome: Genome;
  engine: BiochemEngine;
  brainModel: BrainV05;
  brainRuntime: BrainRuntime;
  vocabulary: Vocabulary;
  world: CreatureWorld;
}

/** Resultado validado listo para reemplazar la sesión activa en caliente. */
export interface RestoredGameSession extends GameSessionBundle {
  meta: SaveGameMeta;
}

/** Opciones para incubar una nueva criatura descendiente (ciclo de vida). */
export interface HatchOffspringOptions {
  parentA: Genome;
  parentB?: Genome;
  seed: number;
  mutationIntensity?: number;
  initialChemicals?: Record<string, number>;
  initialDrives?: Record<string, number>;
}

/** Etapas vitales derivadas determinísticamente de la edad simulada (segundos). */
export type LifeStageId = 'embrion' | 'cria' | 'joven' | 'adulto';

export interface LifeStageInfo {
  id: LifeStageId;
  label: string;
  day: number;
}

/** Calcula el día simulado y la etapa ontogenética de forma determinista. */
export function resolveLifeStage(simTimeSeconds: number): LifeStageInfo {
  const safeTime = Number.isFinite(simTimeSeconds) ? Math.max(0, simTimeSeconds) : 0;
  // 1 día simulado = 60 s simulados para observar etapas ontogenéticas en una sesión real.
  const day = Math.floor(safeTime / 60) + 1;
  if (safeTime < 20) return { id: 'embrion', label: 'Embrión', day };
  if (safeTime < 90) return { id: 'cria', label: 'Cría', day };
  if (safeTime < 240) return { id: 'joven', label: 'Joven', day };
  return { id: 'adulto', label: 'Adulto', day };
}

/** Serializa de forma determinista todos los subsistemas de la partida. */
export function serializeGameState(
  session: Pick<GameSessionBundle, 'genome' | 'engine' | 'brainModel' | 'vocabulary' | 'world'>,
  meta: SaveGameMeta,
): string {
  if (
    typeof meta.creatureName !== 'string' ||
    !meta.creatureName.trim() ||
    meta.creatureName.trim().length > MAX_CREATURE_NAME_LENGTH
  ) {
    throw new RangeError(`creatureName inválido al serializar (1–${MAX_CREATURE_NAME_LENGTH} caracteres)`);
  }
  if (!Number.isFinite(meta.simTime) || meta.simTime < 0) {
    throw new RangeError(`simTime inválido al serializar: ${String(meta.simTime)}`);
  }
  if (!Number.isInteger(meta.frame) || meta.frame < 0) {
    throw new RangeError(`frame inválido al serializar: ${String(meta.frame)}`);
  }
  if (typeof meta.autoReward !== 'boolean' || typeof meta.spatialStrict !== 'boolean') {
    throw new RangeError('autoReward y spatialStrict deben ser booleanos al serializar la partida');
  }

  const envelope: SaveEnvelope = {
    saveVersion: CREATURES_SAVE_VERSION,
    meta: {
      creatureName: meta.creatureName.trim(),
      simTime: meta.simTime,
      frame: meta.frame,
      autoReward: Boolean(meta.autoReward),
      spatialStrict: Boolean(meta.spatialStrict),
    },
    modules: {
      genome: session.genome.serialize(),
      biochem: session.engine.serialize(),
      brain: session.brainModel.serialize(),
      vocabulary: session.vocabulary.serialize(),
      world: session.world.serialize(),
    },
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Valida y reconstruye una sesión completa desde JSON sin tocar ninguna
 * instancia existente. Si algo falla, lanza `RangeError`.
 */
export function restoreGameState(
  json: string,
  brainSeed = DEFAULT_BRAIN_SEED,
): RestoredGameSession {
  if (typeof json !== 'string') {
    throw new RangeError('El archivo de partida debe ser texto JSON');
  }
  if (json.length > MAX_SAVE_JSON_LENGTH) {
    throw new RangeError(`La partida supera el límite de ${MAX_SAVE_JSON_LENGTH / (1024 * 1024)} MiB`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RangeError('El JSON de la partida está mal formado');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RangeError('El sobre de partida debe ser un objeto JSON');
  }

  const candidate = parsed as Partial<SaveEnvelope>;
  if (candidate.saveVersion !== CREATURES_SAVE_VERSION) {
    throw new RangeError(
      `Versión de guardado no soportada: ${String(candidate.saveVersion)} (soportada: ${CREATURES_SAVE_VERSION})`,
    );
  }

  const rawMeta = candidate.meta;
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    throw new RangeError('Faltan los metadatos de sesión válidos en la partida guardada');
  }
  if (
    typeof rawMeta.creatureName !== 'string' ||
    !rawMeta.creatureName.trim() ||
    rawMeta.creatureName.trim().length > MAX_CREATURE_NAME_LENGTH
  ) {
    throw new RangeError(`Nombre de criatura inválido (máximo ${MAX_CREATURE_NAME_LENGTH} caracteres)`);
  }
  if (typeof rawMeta.simTime !== 'number' || !Number.isFinite(rawMeta.simTime) || rawMeta.simTime < 0) {
    throw new RangeError('Tiempo simulado inválido en la partida guardada');
  }
  if (typeof rawMeta.frame !== 'number' || !Number.isInteger(rawMeta.frame) || rawMeta.frame < 0) {
    throw new RangeError('Contador de fotogramas inválido en la partida guardada');
  }
  if (typeof rawMeta.autoReward !== 'boolean' || typeof rawMeta.spatialStrict !== 'boolean') {
    throw new RangeError('Las opciones de sesión guardadas deben ser booleanas');
  }

  const rawModules = candidate.modules;
  if (!rawModules || typeof rawModules !== 'object' || Array.isArray(rawModules)) {
    throw new RangeError('Faltan los módulos serializados en la partida guardada');
  }
  for (const key of ['genome', 'biochem', 'brain', 'vocabulary', 'world'] as const) {
    if (typeof rawModules[key] !== 'string') {
      throw new RangeError(`Módulo ${key} inválido en la partida guardada`);
    }
  }

  // Construcción en cuarentena: si cualquier deserialize falla, nada vivo cambia.
  const genome = new Genome();
  genome.deserialize(rawModules.genome);

  const phenotype = genome.getPhenotype({ ageSeconds: rawMeta.simTime });

  // Extrae el hiddenSize serializado del cerebro para instanciar la topología exacta.
  let serializedHiddenSize = phenotype.brain.hiddenSize;
  try {
    const peekBrain = JSON.parse(rawModules.brain) as { config?: { hiddenSize?: number } };
    if (typeof peekBrain?.config?.hiddenSize === 'number') {
      serializedHiddenSize = peekBrain.config.hiddenSize;
    }
  } catch {
    throw new RangeError('Módulo cerebral inválido en la partida guardada');
  }

  const brainModel = new BrainV05({
    ...phenotype.brain,
    hiddenSize: serializedHiddenSize,
    seed: brainSeed,
  });
  try {
    brainModel.deserialize(rawModules.brain);
  } catch (error) {
    brainModel.dispose();
    throw error;
  }

  const engine = new BiochemEngine({ phenotype });
  try {
    engine.deserialize(rawModules.biochem);
    const vocabulary = new Vocabulary();
    vocabulary.deserialize(rawModules.vocabulary);
    const world = new CreatureWorld();
    world.deserialize(rawModules.world);
    const brainRuntime = createBrainRuntime(genome, () => brainModel);

    return {
      genome,
      engine,
      brainModel,
      brainRuntime,
      vocabulary,
      world,
      meta: {
        creatureName: rawMeta.creatureName.trim(),
        simTime: rawMeta.simTime,
        frame: rawMeta.frame,
        autoReward: rawMeta.autoReward,
        spatialStrict: rawMeta.spatialStrict,
      },
    };
  } catch (error) {
    brainModel.dispose();
    throw error;
  }
}

/**
 * Incuba una cría de siguiente generación combinando herencia genética +
 * mutación estructural determinista y construyendo un organismo nuevo limpio.
 */
export function hatchOffspring(
  options: HatchOffspringOptions,
): RestoredGameSession {
  const seed = normalizeSeed(options.seed);
  const partner = options.parentB ?? options.parentA.clone();
  const childGenome = Genome.crossover(
    options.parentA,
    partner,
    seed,
    options.mutationIntensity ?? 0.22,
  );
  const phenotype = childGenome.getPhenotype({ ageSeconds: 0 });
  const brainModel = new BrainV05({ ...phenotype.brain, seed });
  const brainRuntime = createBrainRuntime(childGenome, () => brainModel);
  const engine = new BiochemEngine({
    initialChemicals: options.initialChemicals,
    initialDrives: options.initialDrives,
    phenotype,
  });
  const vocabulary = new Vocabulary();
  const world = new CreatureWorld();

  const rng = mulberry32(seed ^ 0x51f7a221);
  const nameIndex = Math.floor(rng() * LINEAGE_NAMES.length);
  const creatureName = LINEAGE_NAMES[nameIndex] ?? 'Nilo';

  return {
    genome: childGenome,
    engine,
    brainModel,
    brainRuntime,
    vocabulary,
    world,
    meta: {
      creatureName,
      simTime: 0,
      frame: 0,
      autoReward: true,
      spatialStrict: false,
    },
  };
}

/** Obtiene `window.localStorage` de forma segura o `null` si está bloqueado. */
export function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveGameToStorage(
  storage: StorageLike | null,
  json: string,
  key = DEFAULT_STORAGE_KEY,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

export function loadGameFromStorage(
  storage: StorageLike | null,
  key = DEFAULT_STORAGE_KEY,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function clearGameFromStorage(
  storage: StorageLike | null,
  key = DEFAULT_STORAGE_KEY,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
