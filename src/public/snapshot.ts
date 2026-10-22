/**
 * Derivación determinista del snapshot público de la casa (S1, PLAN-PUBLICO §3).
 *
 * `toPublicSnapshot()` es una **función pura**: mismos inputs ⇒ mismo JSON byte
 * a byte. Cero `Math.random()`, cero DOM, cero relojes reales: todo lo que
 * cambia (día, etapa, reloj) entra por `input`.
 *
 * TABLA DE MOOD (primera regla que encaja gana; umbrales estrictos `>` / `<`):
 *   1. durmiendo  energía < 0.10  Y  sueño   > 0.80
 *   2. enojado    miedo   > 0.80                          (antes que inquieto:
 *      porque inquieto ya cubre miedo > 0.60; sin este orden sería inalcanzable)
 *   3. inquieto   miedo   > 0.60  O  aburrimiento > 0.70
 *   4. hambriento hambre  > 0.70
 *   5. contento   confort > 0.70  Y  hambre < 0.30
 *   6. cansado    energía < 0.30
 *   7. tranquilo  resto de casos
 *
 * TABLA DE DÉFICITOS (needs): déficit = nivel si «más alto es peor»
 * (hambre, sueno, aburrimiento, miedo); déficit = 1 − nivel si «más alto es
 * mejor» (energia, curiosidad, vinculo, confort).
 * Adjetivo del déficit: urgente ≥ 0.75 · bajo ≥ 0.5 · normal ≥ 0.25 · lleno < 0.25.
 *
 * ETAPA por umbrales de edad simulada (misma fuente que el laboratorio,
 * `resolveLifeStage`, para que las dos caras no se contradigan):
 *   huevo < 20 s · cría < 90 s · joven < 240 s · adulto ≥ 240 s
 *   (1 día simulado = 60 s; `embrion` del lab se publica como `huevo`).
 *   NOTA: la etapa NO se calcula desde `day` porque `day` no la determina
 *   (el día 2 cubre cría y joven); se calcula desde `simTime`, que sí.
 *
 * HEADLINE (prioridad fija): learn > growth > need (solo necesidad urgente) >
 * event (cualquier entrada care/world) > none.
 */
import type { DriveId, DriveState } from '../contracts/types';
import type {
  PublicDiaryEntry,
  PublicMood,
  PublicNeed,
  PublicSnapshot,
  PublicStage,
} from '../contracts/ipublic';
import type { Vocabulary } from '../vocab';
import { resolveLifeStage } from '../persistence';
import { PUBLIC_STIMULUS_IDS } from '../habitat/actions';

/** Segundos simulados por día (espejo de `resolveLifeStage`). */
export const SIM_SECONDS_PER_DAY = 60;
/** Máximo de entradas de diario visibles en la casa. */
export const PUBLIC_DIARY_CAP = 8;
/** Número de necesidades públicas (nunca más de 3). */
export const PUBLIC_NEED_COUNT = 3;
/** Titular de reserva cuando no hay nada que contar. */
export const PUBLIC_HEADLINE_NONE = 'Nilo sigue su día';

/** Entrada de la tabla de humores: la primera que encaja gana. */
export interface PublicMoodRule {
  mood: PublicMood;
  /** Descripción humana de la regla (documentación viva, se testea). */
  rule: string;
  /** Evaluación sobre los 8 niveles ya normalizados a 0..1. */
  test: (levels: PublicMoodLevels) => boolean;
}

/** Niveles de los 8 drives para la tabla de mood. */
export interface PublicMoodLevels {
  hambre: number;
  energia: number;
  sueno: number;
  curiosidad: number;
  vinculo: number;
  aburrimiento: number;
  miedo: number;
  confort: number;
}

/** Definición interna de un drive público: dirección del déficit y etiqueta. */
interface DrivePublicDef {
  /** `true` ⇒ más alto = peor (el déficit ES el nivel). */
  higherIsWorse: boolean;
  /** Etiqueta legible en español de la necesidad derivada. */
  label: string;
}

/**
 * Los 8 drives y cómo se leen en la casa.
 * `label` es el texto que verá la gente (infinitivo: «Comer», «Jugar»…).
 */
export const PUBLIC_DRIVES: Readonly<Record<string, DrivePublicDef>> = {
  hambre: { higherIsWorse: true, label: 'Comer' },
  energia: { higherIsWorse: false, label: 'Descansar' },
  sueno: { higherIsWorse: true, label: 'Dormir' },
  curiosidad: { higherIsWorse: false, label: 'Explorar' },
  vinculo: { higherIsWorse: false, label: 'Acurrucarse' },
  aburrimiento: { higherIsWorse: true, label: 'Jugar' },
  miedo: { higherIsWorse: true, label: 'Sentirse seguro' },
  confort: { higherIsWorse: false, label: 'Relajarse' },
};

/** Orden estable de los drives (desempate del top-3: registro Fase 0). */
const DRIVE_ORDER: readonly string[] = [
  'hambre',
  'energia',
  'sueno',
  'curiosidad',
  'vinculo',
  'aburrimiento',
  'miedo',
  'confort',
];

/** Tabla de mood documentada arriba, en orden de evaluación. */
export const MOOD_RULES: readonly PublicMoodRule[] = [
  {
    mood: 'durmiendo',
    rule: 'energía < 0.10 y sueño > 0.80',
    test: (d) => d.energia < 0.1 && d.sueno > 0.8,
  },
  {
    mood: 'enojado',
    rule: 'miedo > 0.80',
    test: (d) => d.miedo > 0.8,
  },
  {
    mood: 'inquieto',
    rule: 'miedo > 0.60 o aburrimiento > 0.70',
    test: (d) => d.miedo > 0.6 || d.aburrimiento > 0.7,
  },
  {
    mood: 'hambriento',
    rule: 'hambre > 0.70',
    test: (d) => d.hambre > 0.7,
  },
  {
    mood: 'contento',
    rule: 'confort > 0.70 y hambre < 0.30',
    test: (d) => d.confort > 0.7 && d.hambre < 0.3,
  },
  {
    mood: 'cansado',
    rule: 'energía < 0.30',
    test: (d) => d.energia < 0.3,
  },
  { mood: 'tranquilo', rule: 'resto de casos', test: () => true },
];

/** Todos los drives conocidos para construir el snapshot. */
export type PublicSnapshotDrives = Record<DriveId, DriveState | undefined>;

/** Entrada de `toPublicSnapshot`: todo el estado vivo que necesita la casa. */
export interface PublicSnapshotInput {
  /** Drives del último tick del motor (los 8 de Fase 0). */
  drives: PublicSnapshotDrives;
  /** Edad simulada en segundos (día, etapa y reloj del diario salen de aquí). */
  simTime: number;
  /** Contador de ticks del servidor (hueco de sincronía). */
  tick: number;
  /** Diario en orden cronológico ASCENDENTE (lo más reciente al final). */
  diary: readonly PublicDiaryEntry[];
  /** Palabras aprendidas hoy (ver `collectLearnedToday`). */
  learnedToday: readonly string[];
  /** Qué está haciendo Nilo ahora mismo (null = sin acción conocida). */
  action: { name: string; guided: boolean } | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Nivel de un drive; ausente/no numérico ⇒ 0 («no elevado»). */
function level(drives: PublicSnapshotDrives, id: DriveId): number {
  const state = drives[id];
  if (!state || typeof state.level !== 'number') return 0;
  return clamp01(state.level);
}

function moodLevels(drives: PublicSnapshotDrives): PublicMoodLevels {
  return {
    hambre: level(drives, 'hambre'),
    energia: level(drives, 'energia'),
    sueno: level(drives, 'sueno'),
    curiosidad: level(drives, 'curiosidad'),
    vinculo: level(drives, 'vinculo'),
    aburrimiento: level(drives, 'aburrimiento'),
    miedo: level(drives, 'miedo'),
    confort: level(drives, 'confort'),
  };
}

/** Aplica la tabla `MOOD_RULES` (primera regla que encaja ⇒ ese humor). */
export function derivePublicMood(drives: PublicSnapshotDrives): PublicMood {
  const levels = moodLevels(drives);
  for (const rule of MOOD_RULES) {
    if (rule.test(levels)) return rule.mood;
  }
  return 'tranquilo';
}

/** Déficit 0..1 de un drive según su dirección (doc de la cabecera). */
export function driveDeficit(drives: PublicSnapshotDrives, id: DriveId): number | null {
  const def = PUBLIC_DRIVES[id];
  if (!def) return null;
  const value = level(drives, id);
  return def.higherIsWorse ? value : 1 - value;
}

/** Adjetivo público de un déficit: urgente ≥ 0.75 · bajo ≥ 0.5 · normal ≥ 0.25 · lleno < 0.25. */
export function needAdjective(deficit: number): PublicNeed['adjective'] {
  const value = clamp01(deficit);
  if (value >= 0.75) return 'urgente';
  if (value >= 0.5) return 'bajo';
  if (value >= 0.25) return 'normal';
  return 'lleno';
}

/** Top-3 de necesidades por déficit (empates ⇒ orden de registro Fase 0). */
export function derivePublicNeeds(drives: PublicSnapshotDrives): PublicNeed[] {
  const candidates = DRIVE_ORDER.map((id, index) => {
    const deficit = driveDeficit(drives, id);
    if (deficit === null) return null;
    return { id, index, deficit };
  }).filter((item): item is { id: string; index: number; deficit: number } => item !== null);

  candidates.sort((a, b) => (b.deficit - a.deficit) || (a.index - b.index));

  return candidates.slice(0, PUBLIC_NEED_COUNT).map((item) => ({
    id: item.id,
    label: PUBLIC_DRIVES[item.id]?.label ?? item.id,
    adjective: needAdjective(item.deficit),
  }));
}

/** Mapea la etapa del laboratorio a la etapa pública (`embrion` ⇒ `huevo`). */
export function publicStageFromSimTime(simTime: number): PublicStage {
  const stage = resolveLifeStage(Math.max(0, Number.isFinite(simTime) ? simTime : 0));
  return stage.id === 'embrion' ? 'huevo' : (stage.id as PublicStage);
}

/** Día simulado (1-based), espejo de `resolveLifeStage`. */
export function publicDayFromSimTime(simTime: number): number {
  return resolveLifeStage(Math.max(0, Number.isFinite(simTime) ? simTime : 0)).day;
}

/** Reloj legible y determinista del diario: `D<día> <mm>:<ss>` sobre el tiempo simulado. */
export function formatSimClock(simTime: number, day: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(simTime) ? simTime : 0));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `D${day} ${mm}:${ss}`;
}

/** Última entrada del diario de un `kind` concreto (o `null`). */
function lastOfKind(
  diary: readonly PublicDiaryEntry[],
  kind: PublicDiaryEntry['kind'],
): PublicDiaryEntry | null {
  for (let i = diary.length - 1; i >= 0; i -= 1) {
    const entry = diary[i];
    if (entry && entry.kind === kind) return entry;
  }
  return null;
}

/** Última entrada que cuenta como «evento» (`world` o `care`), o `null`. */
function lastEvent(diary: readonly PublicDiaryEntry[]): PublicDiaryEntry | null {
  for (let i = diary.length - 1; i >= 0; i -= 1) {
    const entry = diary[i];
    if (entry && (entry.kind === 'world' || entry.kind === 'care')) return entry;
  }
  return null;
}

/** Titular con prioridad learn > growth > need (urgente) > event > none. */
export function derivePublicHeadline(
  diary: readonly PublicDiaryEntry[],
  needs: readonly PublicNeed[],
): { headline: string; headlineKind: PublicSnapshot['headlineKind'] } {
  const learn = lastOfKind(diary, 'learn');
  if (learn) return { headline: learn.text, headlineKind: 'learn' };

  const growth = lastOfKind(diary, 'growth');
  if (growth) return { headline: growth.text, headlineKind: 'growth' };

  const urgent = needs.find((need) => need.adjective === 'urgente');
  if (urgent) {
    return { headline: `Nilo necesita ${urgent.label.toLowerCase()}`, headlineKind: 'need' };
  }

  const event = lastEvent(diary);
  if (event) return { headline: event.text, headlineKind: 'event' };

  return { headline: PUBLIC_HEADLINE_NONE, headlineKind: 'none' };
}

/**
 * Palabras aprendidas durante el día simulado actual, ordenadas alfabéticamente.
 * `sinceSimTime` = instante de inicio del día. Se consultan los estímulos
 * públicos (`PUBLIC_STIMULUS_IDS`): `Vocabulary` no expone listado global.
 */
export function collectLearnedToday(
  vocabulary: Vocabulary,
  sinceSimTime: number,
  stimulusIds: readonly string[] = PUBLIC_STIMULUS_IDS,
): string[] {
  const since = Number.isFinite(sinceSimTime) ? sinceSimTime : 0;
  const words = new Set<string>();
  for (const stimulusId of stimulusIds) {
    for (const entry of vocabulary.recall(stimulusId)) {
      if (entry.learned && entry.lastReinforcedAt >= since) words.add(entry.word);
    }
  }
  return [...words].sort();
}

/** Convierte el estado vivo del motor en el snapshot público (función pura). */
export function toPublicSnapshot(input: PublicSnapshotInput): PublicSnapshot {
  const simTime = Number.isFinite(input.simTime) ? Math.max(0, input.simTime) : 0;
  const day = publicDayFromSimTime(simTime);
  const needs = derivePublicNeeds(input.drives);
  const { headline, headlineKind } = derivePublicHeadline(input.diary, needs);

  return {
    day,
    stage: publicStageFromSimTime(simTime),
    mood: derivePublicMood(input.drives),
    headline,
    headlineKind,
    action: input.action ? { name: input.action.name, guided: Boolean(input.action.guided) } : null,
    needs,
    diary: input.diary.slice(-PUBLIC_DIARY_CAP),
    learnedToday: [...input.learnedToday],
    tick: Number.isFinite(input.tick) ? Math.max(0, Math.floor(input.tick)) : 0,
  };
}
