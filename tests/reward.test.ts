/**
 * Recompensa por reducción de drive (`src/brain/reward.ts`):
 * malestar normalizado 0..1 y recompensa recortada a [-1, 1].
 */
import { describe, expect, it } from 'vitest';
import type { DriveState } from '../src/contracts/types';
import {
  DEFAULT_DISCOMFORT_WEIGHTS,
  DEFAULT_REWARD_GAIN,
  driveDiscomfort,
  driveReductionReward,
} from '../src/brain/reward';

function drives(levels: Record<string, number>): Record<string, DriveState> {
  const out: Record<string, DriveState> = {};
  for (const [id, level] of Object.entries(levels)) out[id] = { level, target: level };
  return out;
}

const BEST = drives({ hambre: 0, sueno: 0, aburrimiento: 0, miedo: 0, energia: 1, confort: 1, vinculo: 1 });
const WORST = drives({ hambre: 1, sueno: 1, aburrimiento: 1, miedo: 1, energia: 0, confort: 0, vinculo: 0 });

describe('driveDiscomfort', () => {
  it('0 con todo satisfecho y 1 con todo al peor nivel', () => {
    expect(driveDiscomfort(BEST)).toBeCloseTo(0, 12);
    expect(driveDiscomfort(WORST)).toBeCloseTo(1, 12);
  });

  it('es monótono: subir un drive aversivo aumenta el malestar', () => {
    const base = drives({ hambre: 0.2, sueno: 0.2, aburrimiento: 0.2, miedo: 0.2, energia: 0.8, confort: 0.8, vinculo: 0.8 });
    const hungry = drives({ hambre: 0.9, sueno: 0.2, aburrimiento: 0.2, miedo: 0.2, energia: 0.8, confort: 0.8, vinculo: 0.8 });
    expect(driveDiscomfort(hungry)).toBeGreaterThan(driveDiscomfort(base));
  });

  it('es monótono: perder un drive deseable aumenta el malestar', () => {
    const base = drives({ energia: 0.9, confort: 0.9, vinculo: 0.9 });
    const tired = drives({ energia: 0.1, confort: 0.9, vinculo: 0.9 });
    expect(driveDiscomfort(tired)).toBeGreaterThan(driveDiscomfort(base));
  });

  it('los drives ausentes cuentan como nivel 0 (los deseables, insatisfechos)', () => {
    const norm = Object.values(DEFAULT_DISCOMFORT_WEIGHTS).reduce((sum, w) => sum + Math.abs(w), 0);
    const desirable = Object.values(DEFAULT_DISCOMFORT_WEIGHTS)
      .filter((w) => w < 0)
      .reduce((sum, w) => sum + Math.abs(w), 0);
    expect(driveDiscomfort({})).toBeCloseTo(desirable / norm, 12);
  });

  it('recorta niveles fuera de 0..1 y tolera NaN', () => {
    const saturado = drives({ hambre: 3, energia: -2, confort: Number.NaN, sueno: 0, aburrimiento: 0, miedo: 0, vinculo: 1 });
    expect(driveDiscomfort(saturado)).toBeCloseTo(driveDiscomfort(drives({ hambre: 1, energia: 0, confort: 0, sueno: 0, aburrimiento: 0, miedo: 0, vinculo: 1 })), 12);
  });

  it('admite pesos propios (tabla extensible) y devuelve 0 sin pesos', () => {
    expect(driveDiscomfort(drives({ hambre: 0.5 }), { hambre: 1 })).toBeCloseTo(0.5, 12);
    expect(driveDiscomfort(BEST, {})).toBe(0);
    expect(driveDiscomfort(drives({ hambre: 1 }), { hambre: -1 })).toBeCloseTo(0, 12);
  });

  it('lanza RangeError con un peso no finito', () => {
    expect(() => driveDiscomfort(BEST, { hambre: Number.NaN })).toThrow(RangeError);
  });
});

describe('driveReductionReward', () => {
  it('es positiva si el malestar baja y negativa si sube', () => {
    expect(driveReductionReward(0.5, 0.4)).toBeCloseTo(0.1 * DEFAULT_REWARD_GAIN, 12);
    expect(driveReductionReward(0.4, 0.5)).toBeCloseTo(-0.1 * DEFAULT_REWARD_GAIN, 12);
  });

  it('se recorta a [-1, 1]', () => {
    expect(driveReductionReward(1, 0)).toBe(1);
    expect(driveReductionReward(0, 1)).toBe(-1);
    expect(driveReductionReward(100, -100)).toBe(1);
  });

  it('gain 0 ⇒ sin señal; gain propia respeta la escala', () => {
    expect(driveReductionReward(0.5, 0.4, 0)).toBe(0);
    expect(driveReductionReward(0.5, 0.4, 1)).toBeCloseTo(0.1, 12);
  });

  it('sin cambio de malestar la recompensa es 0', () => {
    expect(driveReductionReward(0.3, 0.3)).toBe(0);
  });

  it.each([
    ['malestarAntes', [Number.NaN, 0.2, 6]],
    ['malestarDespués', [0.2, Number.POSITIVE_INFINITY, 6]],
    ['gain', [0.2, 0.1, Number.NaN]],
  ])('lanza RangeError con %s no finito', (_label, args) => {
    expect(() => driveReductionReward(args[0], args[1], args[2])).toThrow(RangeError);
  });
});
