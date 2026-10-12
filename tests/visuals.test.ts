import { describe, expect, it, vi } from 'vitest';
import type { DriveId, DriveState } from '../src/contracts/types';
import { CanvasVisuals, deriveMood } from '../src/visuals/canvasVisuals';

type KnownDrive =
  | 'hambre'
  | 'energia'
  | 'sueno'
  | 'curiosidad'
  | 'vinculo'
  | 'aburrimiento'
  | 'miedo'
  | 'confort';

function snapshot(levels: Record<KnownDrive, number>): Record<DriveId, DriveState> {
  return Object.fromEntries(
    Object.entries(levels).map(([id, level]) => [id, { level, target: level }]),
  ) as Record<DriveId, DriveState>;
}

const cheerfulDrives = snapshot({
  hambre: 0.05,
  energia: 0.85,
  sueno: 0.08,
  curiosidad: 0.35,
  vinculo: 0.85,
  aburrimiento: 0.08,
  miedo: 0.02,
  confort: 0.9,
});

const distressedDrives = snapshot({
  hambre: 0.95,
  energia: 0.35,
  sueno: 0.15,
  curiosidad: 0.05,
  vinculo: 0.12,
  aburrimiento: 0.75,
  miedo: 0.95,
  confort: 0.12,
});

const excitedDrives = snapshot({
  hambre: 0.2,
  energia: 0.9,
  sueno: 0.1,
  curiosidad: 1,
  vinculo: 0.8,
  aburrimiento: 0.1,
  miedo: 0.05,
  confort: 0.9,
});

describe('deriveMood', () => {
  it('prefiere feliz cuando energía, confort y vínculo son altos', () => {
    expect(deriveMood(cheerfulDrives)).toBe('happy');
  });

  it('refleja hambre, miedo y malestar como tristeza', () => {
    expect(deriveMood(distressedDrives)).toBe('sad');
  });

  it('prioriza sueño elevado como estado soñoliento', () => {
    expect(
      deriveMood(
        snapshot({
          hambre: 0.1,
          energia: 0.9,
          sueno: 0.9,
          curiosidad: 0.95,
          vinculo: 0.9,
          aburrimiento: 0.05,
          miedo: 0.02,
          confort: 0.95,
        }),
      ),
    ).toBe('sleepy');
  });

  it('refleja curiosidad con energía como excitación', () => {
    expect(deriveMood(excitedDrives)).toBe('excited');
  });

  it('tolera drives ausentes y recorta valores fuera de 0..1', () => {
    expect(deriveMood({})).toBe('happy');
    expect(
      deriveMood({
        hambre: { level: 3, target: 3 },
        energia: { level: 2, target: 2 },
        sueno: { level: -1, target: -1 },
        curiosidad: { level: 2, target: 2 },
        vinculo: { level: 2, target: 2 },
        aburrimiento: { level: -1, target: -1 },
        miedo: { level: -1, target: -1 },
        confort: { level: 2, target: 2 },
      }),
    ).toBe('excited');
  });

  it('monta el canvas, pinta el snapshot y limpia los metadatos al desmontar', () => {
    class FakePath2D {
      constructor(readonly data: string) {}
    }

    const gradient = { addColorStop: vi.fn() };
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      ellipse: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
      dataset: {} as DOMStringMap,
      getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600 }) as DOMRect),
      getContext: vi.fn(() => context),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    } as unknown as HTMLCanvasElement;
    const visuals = new CanvasVisuals();
    vi.stubGlobal('Path2D', FakePath2D);

    try {
      visuals.mount(canvas);
      visuals.render({
        frame: 1,
        drives: excitedDrives,
        chemicals: {},
        simTime: 0.3,
      });

      expect(canvas.dataset.mood).toBe('excited');
      expect(canvas.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        expect.stringContaining('emocionado'),
      );
      expect(context.stroke).toHaveBeenCalled();
      expect(context.fill).toHaveBeenCalled();

      visuals.unmount();
      expect(canvas.removeAttribute).toHaveBeenCalledWith('data-mood');
    } finally {
      visuals.unmount();
      vi.unstubAllGlobals();
    }
  });
});
