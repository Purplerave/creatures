/**
 * Smoke test de la app: carga `index.html` en un DOM de prueba e importa
 * `src/main.ts` tal y como lo hace Vite. Verifica que los ids del HTML y del
 * runtime siguen casando, que cerebro/mundo aparecen y que los controles de
 * prueba manual, premio/castigo y vocabulario responden.
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
let frameTime = 0;

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
  frameTime = performance.now();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** Hace avanzar `frames` fotogramas con un dt de ~16,7 ms. */
function runFrames(frames: number): void {
  for (let i = 0; i < frames; i++) {
    const callback = frameCallback;
    if (!callback) throw new Error('El bucle de la app no pidió otro fotograma');
    frameTime += 16.7;
    callback(frameTime);
  }
}

function text(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? '';
}

describe('app — arranque', () => {
  it('pinta los drives, las acciones del cerebro y los objetos del mundo', () => {
    runFrames(3);
    expect(document.querySelectorAll('#drive-grid .drive-card')).toHaveLength(8);
    expect(document.querySelectorAll('#brain-action-grid .brain-action-row')).toHaveLength(DEFAULT_ACTIONS.length);
    const objects = Array.from(document.querySelectorAll<HTMLElement>('#world-grid .world-object'));
    expect(objects).toHaveLength(8);
    expect(objects.map((object) => object.querySelector('h3')?.textContent)).toEqual([
      'Nido mullido', 'Comedero', 'Pelota', 'Luz suave', 'Túnel de tela',
      'Ventana al jardín', 'Xilófono de madera', 'Peluche compañero',
    ]);
    expect(document.querySelectorAll('#habitat-challenges .habitat-challenge')).toHaveLength(4);
    expect(document.getElementById('world-action-form')).not.toBeNull();
    expect(text('brain-decision')).not.toBe('');
    expect(text('brain-epsilon-value')).toMatch(/^\d+%$/);
    expect(text('brain-stats')).toMatch(/^\d+ decisiones · \d+ refuerzos$/);
  });

  it('deja el juego visible y pliega los paneles técnicos', () => {
    const advanced = document.querySelector<HTMLDetailsElement>('.advanced-lab');
    expect(advanced?.open).toBe(false);
    expect(advanced?.querySelector('#brain-canvas')).not.toBeNull();
    expect(document.querySelector('.primary-stack #app')).not.toBeNull();
    expect(document.querySelector('.primary-stack #world-grid')).not.toBeNull();
    expect(document.querySelector('.primary-stack #drive-grid')).toBeNull();
    expect((document.getElementById('autonomy-toggle') as HTMLInputElement).checked).toBe(false);
  });

  it('marca la acción tomada en el panel y la refleja en el badge de estado', () => {
    runFrames(10);
    const chosen = document.querySelectorAll('#brain-action-grid .brain-action-row[data-chosen="true"]');
    expect(chosen).toHaveLength(1);
    const mood = document.getElementById('mood');
    expect(mood?.getAttribute('title')).toMatch(/decisión del cerebro · .+ · confianza \d/);
  });

  it('avanza las decisiones sin mover ni entrenar a Nilo en modo guiado', () => {
    runFrames(2);
    const before = text('brain-stats');
    runFrames(60);
    const after = text('brain-stats');
    const decisions = (value: string): number => Number(/^(\d+)/.exec(value)?.[1] ?? 0);
    const reinforcements = (value: string): number => Number(/(\d+) refuerzos$/.exec(value)?.[1] ?? 0);
    expect(decisions(after)).toBeGreaterThan(decisions(before));
    // El aprendizaje automático queda reservado para el modo autónomo.
    expect(reinforcements(after)).toBe(reinforcements(before));
  });
});

describe('app — enseñanza manual', () => {
  const reinforcements = (value: string): number => Number(/(\d+) refuerzos$/.exec(value)?.[1] ?? 0);
  const click = (id: string): void => {
    document.getElementById(id)?.dispatchEvent(new window.Event('click'));
  };

  it('premiar refuerza la última decisión y lo cuenta', () => {
    runFrames(2);
    // Los controles manuales actualizan el contador inmediatamente.
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
    const autonomy = document.getElementById('autonomy-toggle');
    if (!(autonomy instanceof HTMLInputElement)) throw new Error('Falta el interruptor #autonomy-toggle');
    autonomy.checked = true;
    autonomy.dispatchEvent(new window.Event('change'));
    runFrames(60);
    expect(reinforcements(text('brain-stats'))).toBeGreaterThan(before);
  });

  it('una actividad guiada con efecto medible enseña esa preferencia al cerebro', () => {
    const autonomy = document.getElementById('autonomy-toggle');
    if (!(autonomy instanceof HTMLInputElement)) throw new Error('Falta el interruptor #autonomy-toggle');
    autonomy.checked = false;
    autonomy.dispatchEvent(new window.Event('change'));
    const spatial = document.getElementById('spatial-strict');
    if (!(spatial instanceof HTMLInputElement)) throw new Error('Falta el interruptor #spatial-strict');
    spatial.checked = false; // La acción aplica su impulso inmediatamente en modo híbrido.
    spatial.dispatchEvent(new window.Event('change'));
    const form = document.getElementById('world-action-form');
    const select = document.getElementById('world-action-select');
    if (!(form instanceof HTMLFormElement) || !(select instanceof HTMLSelectElement)) {
      throw new Error('Falta el formulario de prueba del mundo');
    }
    select.value = 'descansar';
    const before = text('brain-stats');
    form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
    expect(text('world-feedback')).toMatch(/^Actividad guiada:/);
    expect(text('world-action')).toMatch(/^Tú elegiste · Descansar/);
    expect(reinforcements(text('brain-stats'))).toBe(reinforcements(before) + 1);
    expect(text('learning-last')).toMatch(/^Aprendió: «Descansar» mejoró/);
    expect(text('learning-count')).toMatch(/^\d+ refuerzo/);
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

describe('app — L2 vista cerebral, F2/F4 genoma y Fase 5 persistencia', () => {
  const click = (id: string): void => {
    document.getElementById(id)?.dispatchEvent(new window.Event('click'));
  };

  it('monta el canvas L2 (#brain-canvas) en modo mlp vivo consumiendo D2', () => {
    runFrames(4);
    const brainCanvas = document.getElementById('brain-canvas');
    expect(brainCanvas).not.toBeNull();
    expect(brainCanvas?.dataset.mode).toBe('mlp');
    expect(brainCanvas?.dataset.hasThink).toBe('true');
  });

  it('pinta genes, secuencia ORF NCBI, metilación, mutación F2 e incubación generacional', () => {
    expect(document.querySelectorAll('#genome-grid .gene-card').length).toBeGreaterThanOrEqual(8);
    expect(text('genome-dna')).toMatch(/^5′ ATG-.+-TAA 3′ · Péptido \(\d+ aa\): M/);

    const firstMethylButton = document.querySelector('#genome-grid .gene-card button');
    expect(firstMethylButton).not.toBeNull();
    firstMethylButton?.dispatchEvent(new window.Event('click'));
    expect(text('genome-stats')).toContain('1 metilados');

    click('mutate-genome-button');
    expect(text('genome-feedback')).toMatch(/^Mutación F2 aplicada:/);

    click('hatch-offspring-button');
    expect(text('genome-stats')).toMatch(/^GEN\. 02 ·/);
    expect(text('genome-feedback')).toMatch(/^Ha nacido .+ \(generación 2\)/);
  });

  it('guarda, carga y reinicia la sesión coordinada desde los controles de Fase 5', () => {
    runFrames(5);
    click('save-game-button');
    expect(text('persistence-feedback')).toMatch(/^Partida de .+ guardada en este navegador/);
    expect(text('persistence-status')).toBe('Guardada en local');

    click('load-game-button');
    expect(text('persistence-feedback')).toMatch(/^Partida de .+ restaurada con éxito/);

    click('reset-game-button');
    expect(text('genome-stats')).toMatch(/^GEN\. 01 ·/);
  });
});

