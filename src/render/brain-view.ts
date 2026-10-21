/**
 * L2 · Vista independiente de depuración del cerebro (`src/render/brain-view.ts`).
 *
 * Consume exclusivamente el puerto público de depuración D2 (`getDebugState()`)
 * expuesto en `src/brain` (`BrainDebugState`) más contexto sensorial opcional de
 * solo lectura (drives, estímulos y etiquetas de acciones). Nunca escribe en el
 * cerebro, en el adaptador ni en el motor de bioquímica.
 *
 * Inspira su estética en el `<canvas id="brain">` del prototipo `bichito.html`,
 * escalando limpiamente a cualquier `hiddenSize` (4..64) y representando:
 *  - Columna 1: 15 entradas normalizadas (8 drives + 3 estímulos químicos + 4 genes).
 *  - Columna 2: activaciones `tanh` en [-1, 1] de la capa oculta (menta = +, ámbar = −).
 *  - Columna 3: espacio de acciones con sinapsis Bézier coloreadas según signo y
 *    magnitud real de `outputWeights`, anillo de confianza y marca de exploración ε.
 *  - Modo neutro/placeholder honesto si `hasThink === false` o `hiddenActivations` está vacío:
 *    no inventa activaciones ni pesos inexistentes.
 */
import type { BrainDebugState } from '../brain';

/** Fuente mínima requerida por la vista L2 (compatible con `BrainV05Adapter`). */
export interface BrainDebugSource {
  getDebugState(): BrainDebugState;
}

/** Etiqueta de acción opcional para enriquecer la columna derecha. */
export interface BrainViewActionMeta {
  id: string;
  name: string;
  value: number;
}

/** Contexto opcional de solo lectura para colorear entradas y probabilidades. */
export interface BrainViewFrameContext {
  /** Niveles normalizados 0..1 de los 8 drives en orden `DRIVE_ORDER`. */
  drives?: readonly number[];
  /** Niveles normalizados 0..1 de los 3 estímulos químicos. */
  stimuli?: readonly number[];
  /** Catálogo de acciones (código escalar y nombre). */
  actions?: readonly BrainViewActionMeta[];
  /** Probabilidades softmax opcionales por acción (0..1). */
  probabilities?: readonly number[];
  /** ε actual opcional (0..1) para mostrar porcentaje en cabecera. */
  epsilon?: number;
}

export interface BrainViewOptions {
  /** Máximo de neuronas ocultas dibujadas individualmente antes de submuestrear (por defecto 28). */
  maxRenderedHiddenNodes?: number;
}

interface ThemePalette {
  surface: string;
  ink: string;
  muted: string;
  line: string;
  teal: string;
  amber: string;
  coral: string;
}

const DEFAULT_PALETTE: ThemePalette = {
  surface: '#e3ece7',
  ink: '#14221f',
  muted: '#53635f',
  line: '#c4d2cc',
  teal: '#087f78',
  amber: '#e8a53b',
  coral: '#df6d52',
};

const INPUT_LABELS: readonly string[] = [
  'Hambre',
  'Energía',
  'Sueño',
  'Curios.',
  'Vínculo',
  'Aburr.',
  'Miedo',
  'Confort',
  'Dopam.',
  'Cortisol',
  'Adenos.',
  'Gen·Ale',
  'Gen·Soc',
  'Gen·Res',
  'Gen·Met',
];

const FALLBACK_ACTIONS: readonly BrainViewActionMeta[] = [
  { id: 'descansar', name: 'Descansar', value: -1 },
  { id: 'acurrucarse', name: 'Acurrucarse', value: -0.5 },
  { id: 'observar', name: 'Observar', value: 0 },
  { id: 'explorar', name: 'Explorar', value: 0.5 },
  { id: 'buscar', name: 'Buscar', value: 1 },
];

const FULL_TURN = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function readPalette(): ThemePalette {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return DEFAULT_PALETTE;
  }
  const style = getComputedStyle(document.documentElement);
  const pick = (variable: string, fallback: string): string => {
    const raw = style.getPropertyValue(variable).trim();
    return raw || fallback;
  };
  return {
    surface: pick('--surface-soft', DEFAULT_PALETTE.surface),
    ink: pick('--ink', DEFAULT_PALETTE.ink),
    muted: pick('--muted', DEFAULT_PALETTE.muted),
    line: pick('--line', DEFAULT_PALETTE.line),
    teal: pick('--teal', DEFAULT_PALETTE.teal),
    amber: pick('--amber', DEFAULT_PALETTE.amber),
    coral: pick('--coral', DEFAULT_PALETTE.coral),
  };
}

function spreadY(count: number, index: number, top: number, bottom: number): number {
  if (count <= 1) return (top + bottom) / 2;
  return top + (index * (bottom - top)) / (count - 1);
}

export class BrainView {
  private readonly source: BrainDebugSource;
  private readonly maxHiddenNodes: number;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeListener: (() => void) | null = null;

  constructor(source: BrainDebugSource, options: BrainViewOptions = {}) {
    if (!source || typeof source.getDebugState !== 'function') {
      throw new TypeError('BrainView requiere una fuente con getDebugState()');
    }
    this.source = source;
    this.maxHiddenNodes = Math.max(4, Math.round(options.maxRenderedHiddenNodes ?? 28));
  }

  /** Adjunta la vista a un elemento `<canvas>`. */
  mount(canvas: HTMLCanvasElement): void {
    this.unmount();
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('No se pudo obtener el contexto 2D para la vista cerebral L2');
    }
    this.canvas = canvas;
    this.context = context;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(canvas);
    } else if (typeof window !== 'undefined') {
      this.resizeListener = () => this.resizeCanvas();
      window.addEventListener('resize', this.resizeListener);
    }

    this.resizeCanvas();
  }

  /** Desmonta listeners y limpia atributos de estado en el canvas. */
  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
    }
    this.resizeListener = null;

    this.canvas?.removeAttribute('data-has-think');
    this.canvas?.removeAttribute('data-mode');
    this.canvas?.removeAttribute('data-action');
    this.canvas?.removeAttribute('data-explored');
    this.canvas = null;
    this.context = null;
    this.width = 0;
    this.height = 0;
  }

  /** Dibuja un fotograma de depuración leyendo el snapshot D2 actual. */
  render(frame: BrainViewFrameContext = {}): BrainDebugState {
    const state = this.source.getDebugState();
    const { canvas, context } = this;
    if (!canvas || !context) return state;

    const hasMlp = state.hasThink && state.hiddenActivations.length > 0;
    const mode = !state.hasThink ? 'idle' : hasMlp ? 'mlp' : 'placeholder';

    canvas.dataset.hasThink = String(state.hasThink);
    canvas.dataset.mode = mode;
    canvas.dataset.action = state.actionName;
    canvas.dataset.explored = String(state.explored);
    canvas.setAttribute(
      'aria-label',
      state.hasThink
        ? `Red cerebral de Nilo: decisión ${state.actionName}, confianza ${Math.round(
            clamp01(state.confidence) * 100,
          )}%${state.explored ? ', exploración épsilon activa' : ''}.`
        : 'Red cerebral de Nilo: esperando la primera decisión.',
    );

    if (this.width <= 0 || this.height <= 0) this.resizeCanvas();
    if (this.width <= 0 || this.height <= 0) return state;

    const palette = readPalette();
    context.clearRect(0, 0, this.width, this.height);

    const actions = frame.actions && frame.actions.length > 0 ? frame.actions : FALLBACK_ACTIONS;
    const chosenActionIndex = this.resolveChosenIndex(actions, state);

    const topPad = 28;
    const bottomPad = this.height - 14;
    const showLabels = this.width >= 430;
    const leftX = showLabels ? 62 : 24;
    const midX = this.width * 0.5;
    const rightX = showLabels ? this.width - 84 : this.width - 26;

    // 1) Vector de entradas de 15 canales (8 drives + 3 estímulos + 4 genes D2).
    const inputValues: number[] = [];
    for (let i = 0; i < 8; i++) inputValues.push(clamp01(frame.drives?.[i] ?? 0));
    for (let i = 0; i < 3; i++) inputValues.push(clamp01(frame.stimuli?.[i] ?? 0));
    for (let i = 0; i < 4; i++) inputValues.push(clamp01(state.genomeInputs[i] ?? 0));

    const inputNodes = inputValues.map((value, index) => ({
      x: leftX,
      y: spreadY(inputValues.length, index, topPad, bottomPad),
      value,
      group: index < 8 ? 'drive' : index < 11 ? 'chem' : 'gene',
      label: INPUT_LABELS[index] ?? `In ${index + 1}`,
    }));

    // 2) Neuronas ocultas reales (submuestreadas determinísticamente si superan el máximo visual).
    const hiddenTotal = state.hiddenActivations.length;
    const hiddenIndices: number[] = [];
    if (hiddenTotal > 0) {
      const visibleCount = Math.min(hiddenTotal, this.maxHiddenNodes);
      for (let k = 0; k < visibleCount; k++) {
        hiddenIndices.push(
          visibleCount === 1
            ? 0
            : Math.min(hiddenTotal - 1, Math.round((k * (hiddenTotal - 1)) / (visibleCount - 1))),
        );
      }
    }

    const hiddenNodes = hiddenIndices.map((neuronIndex, slotIndex) => ({
      neuronIndex,
      x: midX,
      y: spreadY(hiddenIndices.length, slotIndex, topPad + 4, bottomPad - 4),
      activation: clamp(state.hiddenActivations[neuronIndex] ?? 0, -1, 1),
    }));

    // 3) Nodos de salida (acciones).
    const actionNodes = actions.map((action, index) => {
      const chosen = state.hasThink && index === chosenActionIndex;
      const prob =
        frame.probabilities && frame.probabilities[index] !== undefined
          ? clamp01(frame.probabilities[index]!)
          : chosen
            ? clamp01(state.confidence)
            : 0.12;
      return {
        x: rightX,
        y: spreadY(actions.length, index, topPad + 12, bottomPad - 12),
        action,
        chosen,
        probability: prob,
      };
    });

    // Cabecera compacta de telemetría.
    this.drawHeader(context, palette, state, hiddenTotal, actions.length, frame.epsilon);

    // Conexiones Entrada → Oculta (cuando hay activaciones reales).
    if (hiddenNodes.length > 0) {
      context.save();
      context.lineWidth = 0.75;
      for (let i = 0; i < inputNodes.length; i++) {
        const inp = inputNodes[i]!;
        if (inp.value < 0.03) continue;
        for (let h = 0; h < hiddenNodes.length; h++) {
          // Subconjunto determinista denso y legible cuando hay muchas ocultas.
          if (hiddenNodes.length > 16 && (i + h) % 2 !== 0) continue;
          const hid = hiddenNodes[h]!;
          const driveStrength = inp.value * Math.abs(hid.activation);
          if (driveStrength < 0.025) continue;
          context.strokeStyle = hid.activation >= 0 ? palette.teal : palette.amber;
          context.globalAlpha = clamp(0.035 + driveStrength * 0.2, 0.03, 0.34);
          this.drawCurve(context, inp.x, inp.y, hid.x, hid.y);
        }
      }
      context.restore();

      // Conexiones Oculta → Acciones usando `outputWeights` reales del puerto D2.
      const weightsPerAction =
        actions.length > 0 && state.outputWeights.length >= actions.length * hiddenTotal
          ? hiddenTotal
          : 0;

      context.save();
      for (let a = 0; a < actionNodes.length; a++) {
        const out = actionNodes[a]!;
        for (let h = 0; h < hiddenNodes.length; h++) {
          const hid = hiddenNodes[h]!;
          const rawWeight =
            weightsPerAction > 0
              ? (state.outputWeights[a * weightsPerAction + hid.neuronIndex] ?? 0)
              : hid.activation * 0.4;
          const contribution = rawWeight * hid.activation;
          const magnitude = Math.min(1, Math.abs(rawWeight) * 0.55 + Math.abs(contribution) * 0.55);
          if (magnitude < 0.03 && !out.chosen) continue;

          context.strokeStyle = rawWeight >= 0 ? palette.teal : palette.coral;
          context.lineWidth = out.chosen ? 0.9 + magnitude * 1.65 : 0.65 + magnitude * 0.7;
          context.globalAlpha = out.chosen
            ? clamp(0.11 + magnitude * 0.52, 0.1, 0.72)
            : clamp(0.03 + magnitude * 0.16, 0.025, 0.24);
          this.drawCurve(context, hid.x, hid.y, out.x, out.y);
        }
      }
      context.restore();
    } else if (state.hasThink) {
      // Modo placeholder honesto: muestra el puente entrada → decisión sin inventar capa oculta.
      const chosenNode = actionNodes[Math.max(0, chosenActionIndex)];
      if (chosenNode) {
        context.save();
        context.strokeStyle = palette.teal;
        context.lineWidth = 1;
        for (const inp of inputNodes) {
          context.globalAlpha = 0.06 + inp.value * 0.2;
          this.drawCurve(context, inp.x, inp.y, chosenNode.x, chosenNode.y);
        }
        context.restore();
      }
    }

    // Dibuja nodos de entrada, capa oculta y acciones.
    this.drawInputNodes(context, palette, inputNodes, showLabels);
    this.drawHiddenNodes(context, palette, hiddenNodes, midX, (topPad + bottomPad) / 2, state.hasThink);
    this.drawActionNodes(context, palette, actionNodes, showLabels, state.explored);

    return state;
  }

  private resolveChosenIndex(actions: readonly BrainViewActionMeta[], state: BrainDebugState): number {
    if (!state.hasThink) return -1;
    const byName = actions.findIndex(
      (item) => item.name.toLowerCase() === state.actionName.toLowerCase() || item.id === state.actionName,
    );
    if (byName >= 0) return byName;
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < actions.length; i++) {
      const dist = Math.abs(actions[i]!.value - state.action);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  private drawCurve(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    context.beginPath();
    if (typeof context.moveTo === 'function' && typeof context.bezierCurveTo === 'function') {
      const span = x2 - x1;
      context.moveTo(x1, y1);
      context.bezierCurveTo(x1 + span * 0.36, y1, x1 + span * 0.64, y2, x2, y2);
    } else {
      context.arc((x1 + x2) / 2, (y1 + y2) / 2, 1, 0, FULL_TURN);
    }
    context.stroke();
  }

  private drawHeader(
    context: CanvasRenderingContext2D,
    palette: ThemePalette,
    state: BrainDebugState,
    hiddenTotal: number,
    actionCount: number,
    epsilon?: number,
  ): void {
    if (typeof context.fillText !== 'function') return;
    context.save();
    context.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillStyle = palette.muted;
    const archLabel =
      hiddenTotal > 0
        ? `15 ENTRADAS · ${hiddenTotal} TANH · ${actionCount} ACCIONES`
        : state.hasThink
          ? `PUERTO D2 · MODO PLACEHOLDER (${actionCount} ACCIONES)`
          : 'PUERTO D2 · ESPERANDO PRIMER THINK()';
    context.textAlign = 'left';
    context.fillText(archLabel, 12, 15);

    if (state.hasThink) {
      context.textAlign = 'right';
      context.fillStyle = state.explored ? palette.amber : palette.teal;
      const epsSuffix = epsilon !== undefined ? ` · ε ${Math.round(clamp01(epsilon) * 100)}%` : '';
      const modeTag = state.explored ? 'EXPLORACIÓN ε' : 'POLÍTICA GREEDY';
      context.fillText(
        `${modeTag} · CONF ${Math.round(clamp01(state.confidence) * 100)}%${epsSuffix}`,
        this.width - 12,
        15,
      );
    }
    context.restore();
  }

  private drawInputNodes(
    context: CanvasRenderingContext2D,
    palette: ThemePalette,
    nodes: ReadonlyArray<{ x: number; y: number; value: number; group: string; label: string }>,
    showLabels: boolean,
  ): void {
    context.save();
    for (const node of nodes) {
      const color =
        node.group === 'drive' ? palette.teal : node.group === 'chem' ? palette.amber : palette.coral;
      const radius = 2.6 + node.value * 2.4;

      context.globalAlpha = 0.18 + node.value * 0.72;
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 0.75;
      context.strokeStyle = palette.ink;
      context.lineWidth = 0.75;
      context.beginPath();
      context.arc(node.x, node.y, 2.5, 0, FULL_TURN);
      context.stroke();

      if (showLabels && typeof context.fillText === 'function') {
        context.globalAlpha = 0.82;
        context.fillStyle = palette.muted;
        context.font = '600 8.5px ui-sans-serif, system-ui, sans-serif';
        context.textAlign = 'right';
        context.fillText(node.label, node.x - 8, node.y + 3);
      }
    }
    context.restore();
  }

  private drawHiddenNodes(
    context: CanvasRenderingContext2D,
    palette: ThemePalette,
    nodes: ReadonlyArray<{ x: number; y: number; activation: number }>,
    centerX: number,
    centerY: number,
    hasThink: boolean,
  ): void {
    context.save();
    if (nodes.length === 0) {
      if (typeof context.fillText === 'function') {
        context.globalAlpha = 0.72;
        context.fillStyle = palette.muted;
        context.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.textAlign = 'center';
        context.fillText(
          hasThink ? 'capa oculta no expuesta' : 'sin activación aún',
          centerX,
          centerY,
        );
      }
      context.restore();
      return;
    }

    for (const node of nodes) {
      const mag = Math.abs(node.activation);
      const color = node.activation >= 0 ? palette.teal : palette.amber;
      const radius = 2.4 + mag * 3.1;

      context.globalAlpha = 0.18 + mag * 0.76;
      context.fillStyle = color;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 0.65;
      context.strokeStyle = palette.ink;
      context.lineWidth = 0.7;
      context.beginPath();
      context.arc(node.x, node.y, 2.3, 0, FULL_TURN);
      context.stroke();
    }
    context.restore();
  }

  private drawActionNodes(
    context: CanvasRenderingContext2D,
    palette: ThemePalette,
    nodes: ReadonlyArray<{
      x: number;
      y: number;
      action: BrainViewActionMeta;
      chosen: boolean;
      probability: number;
    }>,
    showLabels: boolean,
    explored: boolean,
  ): void {
    context.save();
    for (const node of nodes) {
      const activeColor = explored ? palette.amber : palette.teal;
      const radius = node.chosen ? 6.4 : 4 + node.probability * 2.2;

      if (node.chosen) {
        context.globalAlpha = 0.22;
        context.fillStyle = activeColor;
        context.beginPath();
        context.arc(node.x, node.y, radius + 5.5, 0, FULL_TURN);
        context.fill();
      }

      context.globalAlpha = node.chosen ? 0.95 : 0.24 + node.probability * 0.55;
      context.fillStyle = node.chosen ? activeColor : palette.amber;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 0.9;
      context.strokeStyle = palette.ink;
      context.lineWidth = node.chosen ? 1.5 : 0.9;
      context.beginPath();
      context.arc(node.x, node.y, Math.max(3.6, radius), 0, FULL_TURN);
      context.stroke();

      if (showLabels && typeof context.fillText === 'function') {
        context.globalAlpha = node.chosen ? 1 : 0.78;
        context.fillStyle = node.chosen ? palette.ink : palette.muted;
        context.font = node.chosen
          ? '700 10px ui-sans-serif, system-ui, sans-serif'
          : '600 9.5px ui-sans-serif, system-ui, sans-serif';
        context.textAlign = 'left';
        context.fillText(node.action.name, node.x + 11, node.y + 3.5);
      }
    }
    context.restore();
  }

  private resizeCanvas(): void {
    const canvas = this.canvas;
    const context = this.context;
    if (!canvas || !context) return;

    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width || canvas.clientWidth || canvas.width);
    const height = Math.max(1, bounds.height || canvas.clientHeight || canvas.height);
    const pixelRatio = Math.min(
      2,
      Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
    );
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.width = width;
    this.height = height;
  }
}
