/**
 * Contrato público de la casa (`PublicSnapshot`) — Fase F1 / S1 del
 * `docs/PLAN-PUBLICO.md` §3.
 *
 * Principio: **la casa no ve el laboratorio**. Ni pesos, ni químicos, ni
 * `BrainDebugState`: solo este snapshot determinista, legible y estable.
 * Cualquier cambio de forma aquí rompe a los consumidores (pantalla pública y
 * servidor SSE); subir versión ⇒ revisar `src/public/snapshot.ts` y sus tests.
 *
 * Derivación documentada (§3 del plan):
 * - `mood`     → regla tabulada sobre los 8 drives (ver `MOOD_RULES` en
 *                `src/public/snapshot.ts`), determinista y con orden fijo.
 * - `needs`    → top-3 por **déficit** de los 8 drives (nunca números fuera).
 * - `headline` → prioridad learn > growth > need > event > none.
 * - `stage`    → umbrales de etapa sobre la edad simulada (misma fuente que el
 *                laboratorio: `resolveLifeStage`, con `embrion` ⇒ `huevo`).
 */

/** Estados públicos de ánimo de Nilo (etiqueta única, sin métricas). */
export type PublicMood =
  | 'tranquilo'
  | 'contento'
  | 'hambriento'
  | 'cansado'
  | 'inquieto'
  | 'enojado'
  | 'durmiendo';

/** Etapa vital pública (nombres de la casa; `embrion` del lab ⇒ `huevo`). */
export type PublicStage = 'huevo' | 'cria' | 'joven' | 'adulto';

/** Una necesidad visible en la casa (SOLO 3, derivadas de los 8 drives). */
export interface PublicNeed {
  /** Id estable del drive del que deriva (p.ej. `'hambre'`). */
  id: string;
  /** Etiqueta legible en español («Comer», «Descansar», «Jugar»…). */
  label: string;
  /**
   * Adjetivo del **déficit** del drive, nunca números:
   * `urgente` ≥ 0.75 · `bajo` ≥ 0.5 · `normal` ≥ 0.25 · `lleno` < 0.25.
   */
  adjective: 'lleno' | 'normal' | 'bajo' | 'urgente';
}

/** Entrada del diario público (máximo 8 visibles; texto ya legible). */
export interface PublicDiaryEntry {
  /** Momento legible, determinista (reloj simulado: `D<día> <mm>:<ss>`). */
  t: string;
  /** Frase en español, sin jerga de laboratorio. */
  text: string;
  kind: 'care' | 'learn' | 'growth' | 'world';
}

/** Snapshot completo que ve la casa viva. */
export interface PublicSnapshot {
  day: number;
  stage: PublicStage;
  mood: PublicMood;
  headline: string;
  headlineKind: 'learn' | 'need' | 'growth' | 'event' | 'none';
  /** Qué hace y si vino de un gesto (`guided = true`). `null` = sin acción. */
  action: { name: string; guided: boolean } | null;
  /** Las 3 necesidades más urgentes por déficit (máximo 3). */
  needs: PublicNeed[];
  /** Últimas 8 entradas del diario, en orden cronológico ascendente. */
  diary: PublicDiaryEntry[];
  /** Palabras «aprendidas» durante el día simulado actual (del vocabulario). */
  learnedToday: string[];
  /** Contador de ticks del servidor; hueco de sincronía para los clientes. */
  tick: number;
}
