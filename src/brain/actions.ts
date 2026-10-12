/**
 * Espacio de acciones del cerebro v0.5 (codebook público).
 *
 * POR QUÉ UN ESCALAR EN [-1, 1] Y NO UN ONE-HOT:
 * `BrainV05Adapter` (D1, aprobado y fusionado) mapea la salida del cerebro con
 * `actions = [clamp(action, -1, 1)]`, y sus tests fijan exactamente esa
 * superficie (ni campos ni métodos nuevos). Para no tocar código aprobado, el
 * cerebro elige una acción DISCRETA con nombre y la entrega como su CÓDIGO
 * escalar en [-1, 1]; quien consume la salida (main.ts) la decodifica con
 * `actionFromValue()` usando este mismo codebook.
 *
 * Eje del codebook: PASIVIDAD (-1) ↔ ACTIVIDAD (+1). Cuando exista mundo
 * (Fase 4: objetos y eventos), cada `id` se asociará al script/evento
 * correspondiente y el valor escalar seguirá siendo su código de transporte.
 *
 * ⚠️ Mapeo PROVISIONAL (ver docs/CEREBRO.md y docs/ADAPTER.md): la alternativa
 * one-hot requiere cambiar el adaptador y se propone a la CEO/Tecnotron.
 */

/** Una acción del espacio de decisión: id, etiqueta legible y código escalar. */
export interface BrainAction {
  /** Identificador estable (se serializa; no reordenar sin subir versión). */
  id: string;
  /** Etiqueta para UI/depuración. */
  name: string;
  /** Código escalar en [-1, 1] que viaja por `BrainOutput.actions[0]`. */
  value: number;
}

/** Tolerancia para decodificar un código escalar devuelto por el adaptador. */
export const ACTION_VALUE_TOLERANCE = 1e-9;

/** Espacio de acciones por defecto (5 verbos, orden = índice de decisión). */
export const DEFAULT_ACTIONS: readonly BrainAction[] = [
  { id: 'descansar', name: 'Descansar', value: -1 },
  { id: 'acurrucarse', name: 'Acurrucarse', value: -0.5 },
  { id: 'observar', name: 'Observar', value: 0 },
  { id: 'explorar', name: 'Explorar', value: 0.5 },
  { id: 'buscar', name: 'Buscar estímulo', value: 1 },
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Valida un espacio de acciones: no vacío, ids únicos no vacíos, valores
 * finitos en [-1, 1] y ÚNICOS (el código escalar debe poder decodificarse).
 * @throws RangeError si el espacio de acciones no cumple el contrato.
 */
export function validateActions(actions: readonly BrainAction[]): readonly BrainAction[] {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new RangeError('El espacio de acciones debe ser un array no vacío');
  }
  const ids = new Set<string>();
  const values = new Set<number>();
  const normalized: BrainAction[] = [];
  for (const action of actions) {
    if (typeof action !== 'object' || action === null) {
      throw new RangeError('Acción inválida: se esperaba un objeto { id, name, value }');
    }
    if (typeof action.id !== 'string' || !action.id.trim() || /\s/.test(action.id)) {
      throw new RangeError(`Id de acción inválido: «${String(action.id)}» (vacío o con espacios)`);
    }
    if (ids.has(action.id)) throw new RangeError(`Acción duplicada: ${action.id}`);
    if (!isFiniteNumber(action.value) || action.value < -1 || action.value > 1) {
      throw new RangeError(`Valor de acción fuera de [-1, 1] para «${action.id}»: ${String(action.value)}`);
    }
    for (const existing of values) {
      if (Math.abs(existing - action.value) <= ACTION_VALUE_TOLERANCE) {
        throw new RangeError(`Valor de acción duplicado: ${action.value} (el código debe ser único)`);
      }
    }
    ids.add(action.id);
    values.add(action.value);
    normalized.push({
      id: action.id,
      name: typeof action.name === 'string' && action.name.trim() ? action.name : action.id,
      value: action.value,
    });
  }
  return normalized;
}

/**
 * Decodifica un código escalar (lo que llega por `BrainOutput.actions[0]`) a su
 * acción. `null` si ningún código casa dentro de la tolerancia.
 */
export function actionFromValue(
  actions: readonly BrainAction[],
  value: number,
): { action: BrainAction; index: number } | null {
  if (!isFiniteNumber(value)) return null;
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index];
    if (action && Math.abs(action.value - value) <= ACTION_VALUE_TOLERANCE) return { action, index };
  }
  return null;
}

/** Etiqueta legible de un código escalar; devuelve el código si no se conoce. */
export function actionNameFromValue(actions: readonly BrainAction[], value: number): string {
  const found = actionFromValue(actions, value);
  return found ? found.action.name : value.toFixed(2);
}
