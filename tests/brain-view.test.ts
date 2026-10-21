/**
 * Tests de la tarea L2 (`src/render/brain-view.ts`):
 * verifica consumo exclusivo del puerto D2 (`getDebugState()`), modo `idle`
 * antes de `think()`, modo `mlp` con activaciones/pesos reales de `BrainV05`,
 * modo `placeholder` honesto con `PlaceholderBrain` y limpieza en `unmount()`.
 */
import { describe, expect, it, vi } from 'vitest';
import { BrainV05Adapter, PlaceholderBrain } from '../src/brain';
import { BrainV05 } from '../src/brain/brain-v05';
import { BrainView } from '../src/render';

function createMockCanvas() {
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
  } as unknown as CanvasRenderingContext2D;

  const dataset: Record<string, string> = {};
  const attrs = new Map<string, string>();
  const canvas = {
    width: 560,
    height: 224,
    clientWidth: 560,
    clientHeight: 224,
    dataset,
    getBoundingClientRect: vi.fn(() => ({ width: 560, height: 224 }) as DOMRect),
    getContext: vi.fn(() => context),
    setAttribute: vi.fn((k: string, v: string) => attrs.set(k, v)),
    removeAttribute: vi.fn((k: string) => {
      attrs.delete(k);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        delete dataset[camel];
      }
    }),
  } as unknown as HTMLCanvasElement;

  return { canvas, context, dataset, attrs };
}

describe('L2 — BrainView sobre puerto D2', () => {
  it('antes de think() dibuja estado idle neutro sin inventar activaciones', () => {
    const model = new BrainV05({ hiddenSize: 12, seed: 42 });
    const adapter = new BrainV05Adapter(model);
    const view = new BrainView(adapter);
    const { canvas, dataset, attrs } = createMockCanvas();

    view.mount(canvas);
    const state = view.render();

    expect(state.hasThink).toBe(false);
    expect(state.hiddenActivations).toEqual([]);
    expect(state.outputWeights).toEqual([]);
    expect(dataset.hasThink).toBe('false');
    expect(dataset.mode).toBe('idle');
    expect(attrs.get('aria-label')).toMatch(/esperando la primera decisión/i);

    view.unmount();
    expect(canvas.removeAttribute).toHaveBeenCalledWith('data-has-think');
    expect(canvas.removeAttribute).toHaveBeenCalledWith('data-mode');
  });

  it('tras think() con BrainV05 pinta topología MLP viva y sinapsis reales vía D2', () => {
    const model = new BrainV05({ hiddenSize: 10, seed: 99, epsilonInitial: 0 });
    const adapter = new BrainV05Adapter(model, {
      mapGenome: () => [0.2, 0.4, 0.6, 0.8],
    });
    const view = new BrainView(adapter);
    const { canvas, context, dataset, attrs } = createMockCanvas();

    view.mount(canvas);
    adapter.think({
      drives: { hambre: { level: 0.8, target: 0.8 }, energia: { level: 0.3, target: 0.3 } },
      chemicals: { dopamina: 0.5, cortisol: 0.2, adenosina: 0.1 },
      tick: 1,
    });

    const beforeWeights = [...adapter.getDebugState().outputWeights];
    const snapshot = view.render({
      drives: [0.8, 0.3, 0.2, 0.5, 0.4, 0.2, 0.1, 0.6],
      stimuli: [0.5, 0.2, 0.1],
      epsilon: 0.05,
    });

    expect(snapshot.hasThink).toBe(true);
    expect(snapshot.hiddenActivations).toHaveLength(10);
    expect(snapshot.outputWeights).toHaveLength(50);
    expect(dataset.mode).toBe('mlp');
    expect(dataset.action).toBe(snapshot.actionName);
    expect(context.bezierCurveTo).toHaveBeenCalled();
    expect(attrs.get('aria-label')).toContain(snapshot.actionName);

    // Al reforzar, los pesos D2 cambian y BrainView refleja el nuevo estado sin tocar internals.
    adapter.reinforce(1);
    const afterState = view.render();
    expect(afterState.outputWeights).not.toEqual(beforeWeights);
    view.unmount();
  });

  it('con PlaceholderBrain entra en modo placeholder honesto sin fallar', () => {
    const adapter = new BrainV05Adapter(new PlaceholderBrain());
    const view = new BrainView(adapter);
    const { canvas, dataset } = createMockCanvas();

    view.mount(canvas);
    adapter.think({ drives: {}, chemicals: {}, tick: 0 });
    const state = view.render();

    expect(state.hasThink).toBe(true);
    expect(state.hiddenActivations).toEqual([]);
    expect(dataset.mode).toBe('placeholder');
    view.unmount();
  });

  it('rechaza fuentes que no implementen getDebugState()', () => {
    expect(() => new BrainView(null as never)).toThrow(TypeError);
  });
});
