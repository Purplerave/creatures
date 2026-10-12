/**
 * Smoke test de la app: carga `index.html` en un DOM de prueba e importa
 * `src/main.ts` tal y como lo hace Vite. Verifica que los ids del HTML y del
 * runtime siguen casando, que el bucle pinta el panel del cerebro y que los
 * controles de premio/castigo y de vocabulario responden.
 *
 * El canvas se sustituye por un contexto 2D de pega (Path2D incluido): aquí se
 * prueba el cableado, no el dibujo — de eso se ocupa `tests/visuals.test.ts`.
 *
 * @vitest-environment happy-dom
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_ACTIONS } from '../src/brain/actions';

/**
 * Contexto 2D de pega: cualquier método devuelve otro stub encadenable
 * (gradientes incluidos) y cualquier propiedad es asignable.
 */
function stub(): unknown {
  const store = new Map<string | symbol, unknown>();
  const callable = (): unknown => stub();
  return new Proxy(callable, {
    get(_target, property) {
      if (store.has(property)) return store.get(property);
      return stub();
    },
    set(_target, property, value) {
      store.set(property, value);
      return true;
    },
  });
}

function fakeContext(): CanvasRenderingContext2D {
  return stub() as CanvasRenderingContext2D;
}

let frameCallback: ((time: number) => void) | null = null;
let frameId = 0;

beforeAll(async () => {
  class FakePath2D {
    constructor(_data?: string) {}
    addPath(): void {}
  }
  vi.stubGlobal('Path2D', FakePath2D);
  if (typeof globalThis.ResizeObserver === 'undefined') {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  }
  globalThis.HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as unknown as HTMLCanvasElement['getContext'];
  // Fotogramas manuales: el bucle no corre solo (evita timers en la suite).
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    frameCallback = callback;
    frameId += 1;
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frameCallback = null;
  });

  // process.cwd() es la raíz del repo (la raíz de Vite/Vitest).
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');

  await import('../src/main');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** Hace avanzar `frames` fotogramas con un dt de ~16,7 ms. */
function runFrames(frames: number): void {
  let time = performance.now();
  for (let i = 0; i < frames; i++) {
    const callback = frameCallback;
    if (!callback) throw new Error('El bucle de la app no pidió otro fotograma');
    time += 16.7;
    callback(time);
  }
}

function text(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? '';
}

describe('app — arranque', () => {
  it('pinta los 8 drives y las 5 acciones del codebook del cerebro', () => {
    runFrames(3);
    expect(document.querySelectorAll('#drive-grid .drive-card')).toHaveLength(8);
    expect(document.querySelectorAll('#brain-action-grid .brain-action-row')).toHaveLength(DEFAULT_ACTIONS.length);
    expect(text('brain-decision')).not.toBe('');
    expect(text('brain-epsilon-value')).toMatch(/^\d+%$/);
    expect(text('brain-stats')).toMatch(/^\d+ decisiones · \d+ refuerzos$/);
  });

  it('marca la acción tomada en el panel y la refleja en el badge de estado', () => {
    runFrames(10);
    const chosen = document.querySelectorAll('#brain-action-grid .brain-action-row[data-chosen="true"]');
    expect(chosen).toHaveLength(1);
    const mood = document.getElementById('mood');
    expect(mood?.getAttribute('title')).toMatch(/decisión del cerebro · .+ · confianza \d/);
  });

  it('avanza la simulación: decisiones y refuerzos crecen con los fotogramas', () => {
    runFrames(2);
    const before = text('brain-stats');
    runFrames(20);
    const after = text('brain-stats');
    const decisions = (value: string): number => Number(/^(\d+)/.exec(value)?.[1] ?? 0);
    const reinforcements = (value: string): number => Number(/(\d+) refuerzos$/.exec(value)?.[1] ?? 0);
    expect(decisions(after)).toBeGreaterThan(decisions(before));
    // Con el refuerzo automático activo, casi cada fotograma refuerza.
    expect(reinforcements(after)).toBeGreaterThan(reinforcements(before));
  });
});

describe('app — enseñanza manual', () => {
  const reinforcements = (value: string): number => Number(/(\d+) refuerzos$/.exec(value)?.[1] ?? 0);
  const click = (id: string): void => {
    document.getElementById(id)?.dispatchEvent(new window.Event('click'));
  };

  it('premiar refuerza la última decisión y lo cuenta', () => {
    runFrames(2);
    // El primer click fuerza un render fresco del contador (el panel se
    // repinta cada 0,1 s de tiempo simulado, no en cada fotograma).
    click('reward-button');
    const before = reinforcements(text('brain-stats'));
    click('reward-button');
    expect(reinforcements(text('brain-stats'))).toBe(before + 1);
    expect(text('brain-feedback')).toMatch(/^Premio de \+1 sobre «.+»/);
  });

  it('castigar aplica recompensa negativa', () => {
    runFrames(2);
    click('punish-button');
    expect(text('brain-feedback')).toMatch(/^Castigo de −1 sobre «.+»/);
  });

  it('el interruptor desactiva el refuerzo automático', () => {
    const toggle = document.getElementById('auto-reward');
    if (!(toggle instanceof HTMLInputElement)) throw new Error('Falta el interruptor #auto-reward');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    expect(text('brain-feedback')).toMatch(/desactivado/);

    runFrames(12);
    const before = reinforcements(text('brain-stats'));
    runFrames(12);
    expect(reinforcements(text('brain-stats'))).toBe(before); // apagado: no cuenta

    toggle.checked = true;
    toggle.dispatchEvent(new window.Event('change'));
    runFrames(12);
    expect(reinforcements(text('brain-stats'))).toBeGreaterThan(before);
  });

  it('enseñar una palabra sigue funcionando junto al cerebro', () => {
    const form = document.getElementById('teach-form');
    const word = document.getElementById('word-input');
    const stimulus = document.getElementById('stimulus-select');
    if (!(form instanceof HTMLFormElement) || !(word instanceof HTMLInputElement)) {
      throw new Error('Falta el formulario de vocabulario');
    }
    if (!(stimulus instanceof HTMLSelectElement)) throw new Error('Falta el selector de estímulo');
    stimulus.value = 'objeto:pelota';
    word.value = 'pelota';
    form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
    expect(text('vocab-feedback')).toMatch(/«pelota» → Pelota/);
    expect(text('vocab-stats')).toMatch(/^1 palabras · 0\/1 asociaciones aprendidas$/);
    expect(document.querySelectorAll('#vocab-list .vocab-entry')).toHaveLength(1);
  });
});
