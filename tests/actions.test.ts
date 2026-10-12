/**
 * Espacio de acciones del cerebro v0.5: codebook escalar en [-1, 1].
 * Cubre validación, unicidad (el código debe decodificarse) y decodificación.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_VALUE_TOLERANCE,
  DEFAULT_ACTIONS,
  actionFromValue,
  actionNameFromValue,
  validateActions,
} from '../src/brain/actions';

describe('acciones — codebook por defecto', () => {
  it('tiene 5 verbos con códigos únicos dentro de [-1, 1]', () => {
    expect(DEFAULT_ACTIONS).toHaveLength(5);
    for (const action of DEFAULT_ACTIONS) {
      expect(action.value).toBeGreaterThanOrEqual(-1);
      expect(action.value).toBeLessThanOrEqual(1);
      expect(action.id).toBeTruthy();
      expect(action.name).toBeTruthy();
    }
    expect(new Set(DEFAULT_ACTIONS.map((a) => a.value)).size).toBe(5);
    expect(new Set(DEFAULT_ACTIONS.map((a) => a.id)).size).toBe(5);
  });

  it('ordena el eje pasividad ↔ actividad de -1 a +1', () => {
    const values = DEFAULT_ACTIONS.map((a) => a.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBe(-1);
    expect(values[values.length - 1]).toBe(1);
  });
});

describe('acciones — validateActions', () => {
  it('acepta y normaliza un espacio propio (name ausente ⇒ id)', () => {
    const normalized = validateActions([
      { id: 'norte', name: 'Ir al norte', value: -0.25 },
      { id: 'sur', name: '', value: 0.75 },
    ]);
    expect(normalized).toEqual([
      { id: 'norte', name: 'Ir al norte', value: -0.25 },
      { id: 'sur', name: 'sur', value: 0.75 },
    ]);
  });

  it('devuelve una copia: mutar el resultado no toca el original', () => {
    const original = [...DEFAULT_ACTIONS];
    const normalized = validateActions(original);
    expect(normalized).not.toBe(original);
    expect(normalized[0]).not.toBe(original[0]);
  });

  it.each([
    ['array vacío', []],
    ['id duplicado', [
      { id: 'a', name: 'A', value: -1 },
      { id: 'a', name: 'A2', value: 1 },
    ]],
    ['id con espacios', [{ id: 'ir a', name: 'Ir a', value: 0 }]],
    ['id vacío', [{ id: '  ', name: 'Nada', value: 0 }]],
    ['valor fuera de rango', [{ id: 'a', name: 'A', value: 1.5 }]],
    ['valor no finito', [{ id: 'a', name: 'A', value: Number.NaN }]],
    ['código duplicado', [
      { id: 'a', name: 'A', value: 0.5 },
      { id: 'b', name: 'B', value: 0.5 },
    ]],
  ])('lanza RangeError: %s', (_label, actions) => {
    expect(() => validateActions(actions as never)).toThrow(RangeError);
  });
});

describe('acciones — decodificación', () => {
  it('recupera la acción y su índice a partir del código', () => {
    DEFAULT_ACTIONS.forEach((action, index) => {
      const found = actionFromValue(DEFAULT_ACTIONS, action.value);
      expect(found?.index).toBe(index);
      expect(found?.action.id).toBe(action.id);
    });
  });

  it('tolera el ruido de coma flotante dentro de la tolerancia', () => {
    const noisy = DEFAULT_ACTIONS[1].value + ACTION_VALUE_TOLERANCE / 2;
    expect(actionFromValue(DEFAULT_ACTIONS, noisy)?.action.id).toBe(DEFAULT_ACTIONS[1].id);
  });

  it('devuelve null para códigos desconocidos o no finitos', () => {
    expect(actionFromValue(DEFAULT_ACTIONS, 0.77)).toBeNull();
    expect(actionFromValue(DEFAULT_ACTIONS, Number.NaN)).toBeNull();
    expect(actionFromValue(DEFAULT_ACTIONS, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('actionNameFromValue cae al código numérico si no se conoce', () => {
    expect(actionNameFromValue(DEFAULT_ACTIONS, 1)).toBe('Buscar estímulo');
    expect(actionNameFromValue(DEFAULT_ACTIONS, 0.33)).toBe('0.33');
  });
});
