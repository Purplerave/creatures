/**
 * Render de la criatura y su hábitat espacial en Canvas 2D.
 *
 * Los datos de Path2D de Nilo se han portado literalmente de los `d` del SVG de
 * `bichito.html`. Cuando `RenderState.world` está presente (Fase 4 espacial),
 * dibuja también los objetos del mundo ordenados por profundidad (eje Y), la
 * guía de ruta hacia el objetivo, el ciclo procedural de zancada al caminar y
 * el bocadillo expresivo. Este módulo sólo lee snapshots: nunca toca el motor.
 */
import type {
  IVisuals,
  RenderState,
  RenderWorldObject,
  SpatialRenderState,
} from '../contracts/ivisuals';
import type { DriveId, DriveState } from '../contracts/types';

export type CreatureMood = 'happy' | 'sad' | 'sleepy' | 'excited';

export const MOOD_LABELS: Record<CreatureMood, string> = {
  happy: 'Feliz',
  sad: 'Triste',
  sleepy: 'Con sueño',
  excited: 'Emocionado',
};

type MoodDriveId =
  | 'hambre'
  | 'energia'
  | 'sueno'
  | 'curiosidad'
  | 'vinculo'
  | 'aburrimiento'
  | 'miedo'
  | 'confort';

function driveLevel(drives: Record<DriveId, DriveState>, id: MoodDriveId): number {
  const value = drives[id]?.level;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * Deriva una emoción de las ocho necesidades, todas normalizadas a 0..1.
 * La puntuación deja explícito qué drives contribuyen a cada estado; el sueño
 * alto tiene una pequeña prioridad para que no se lea como excitación.
 */
export function deriveMood(drives: Record<DriveId, DriveState>): CreatureMood {
  const hunger = driveLevel(drives, 'hambre');
  const energy = driveLevel(drives, 'energia');
  const sleep = driveLevel(drives, 'sueno');
  const curiosity = driveLevel(drives, 'curiosidad');
  const bond = driveLevel(drives, 'vinculo');
  const boredom = driveLevel(drives, 'aburrimiento');
  const fear = driveLevel(drives, 'miedo');
  const comfort = driveLevel(drives, 'confort');

  if (sleep >= 0.78 || (sleep >= 0.62 && energy <= 0.42)) return 'sleepy';

  const scores: Record<CreatureMood, number> = {
    happy:
      energy * 0.18 +
      comfort * 0.18 +
      bond * 0.16 +
      (1 - hunger) * 0.12 +
      (1 - fear) * 0.10 +
      (1 - boredom) * 0.08 +
      curiosity * 0.04 +
      (1 - sleep) * 0.14,
    sad:
      hunger * 0.20 +
      fear * 0.24 +
      (1 - comfort) * 0.15 +
      (1 - energy) * 0.12 +
      (1 - bond) * 0.10 +
      boredom * 0.08 +
      (1 - curiosity) * 0.07 +
      sleep * 0.04,
    sleepy:
      sleep * 0.58 +
      (1 - energy) * 0.20 +
      (1 - curiosity) * 0.08 +
      boredom * 0.05 +
      (1 - bond) * 0.03 +
      (1 - comfort) * 0.03 +
      hunger * 0.03,
    excited:
      curiosity * 0.40 +
      energy * 0.20 +
      bond * 0.10 +
      (1 - sleep) * 0.14 +
      (1 - fear) * 0.08 +
      (1 - boredom) * 0.04 +
      comfort * 0.04,
  };

  // El orden hace que los empates exactos se resuelvan en un estado calmado.
  let mood: CreatureMood = 'happy';
  for (const candidate of ['sad', 'sleepy', 'excited'] as const) {
    if (scores[candidate] > scores[mood]) mood = candidate;
  }
  return mood;
}

// Paths SVG originales de bichito.html, preservados como datos SVG de Path2D.
const PATH_DATA = {
  antennaLeft: 'M165 132 C126 78 128 48 151 43 C175 39 190 77 192 121',
  antennaRight: 'M336 130 C374 80 373 51 351 45 C326 39 311 78 309 122',
  armLeft: 'M126 260 C89 252 68 274 80 298 C89 317 117 310 145 292',
  armRight: 'M375 260 C413 250 433 275 420 299 C411 317 383 309 357 291',
  legLeft: 'M150 352 C131 405 144 434 183 436 C206 437 219 421 220 391',
  legRight: 'M350 352 C370 404 357 434 318 436 C294 437 282 421 280 391',
  body: 'M123 203 C123 126 177 91 250 91 C324 91 377 128 377 204 L362 351 C356 410 317 430 250 430 C184 430 145 409 138 351 Z',
  earLeft: 'M146 170 C107 141 102 115 123 105 C146 95 163 126 172 158',
  earRight: 'M354 170 C393 141 398 115 377 105 C354 95 337 126 328 158',
  nose: 'M241 274 Q250 282 259 274',
  mouthNeutral: 'M218 298 Q250 326 282 298',
  mouthHappy: 'M218 298 Q250 334 282 298 Q251 313 218 298',
} as const;

type CreaturePathName = keyof typeof PATH_DATA;
type CreaturePaths = Record<CreaturePathName, Path2D>;

function createCreaturePaths(): CreaturePaths {
  const paths = {} as CreaturePaths;
  for (const name of Object.keys(PATH_DATA) as CreaturePathName[]) {
    paths[name] = new Path2D(PATH_DATA[name]);
  }
  return paths;
}

const FULL_TURN = Math.PI * 2;
const VIEWBOX_SIZE = 500;

function normalizedTime(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/** Cierre suave del párpado, repetido con un periodo fijo y sin aleatoriedad. */
function blinkAmount(time: number): number {
  const period = 4.8;
  const phase = time % period;
  const start = 4.08;
  const duration = 0.18;
  if (phase < start || phase > start + duration) return 0;
  return Math.sin(((phase - start) / duration) * Math.PI);
}

/** Un salto breve cada 1,8 segundos mientras la criatura está emocionada. */
function hopAmount(time: number): number {
  const period = 1.8;
  const duration = 0.54;
  const phase = time % period;
  return phase < duration ? Math.sin((phase / duration) * Math.PI) : 0;
}

export class CanvasVisuals implements IVisuals {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private paths: CreaturePaths | null = null;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeListener: (() => void) | null = null;

  mount(canvas: HTMLCanvasElement): void {
    this.unmount();

    if (typeof Path2D === 'undefined') {
      throw new Error('Este navegador no soporta Path2D, necesario para dibujar a Nilo.');
    }

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('No se pudo obtener el contexto 2d del canvas');

    this.canvas = canvas;
    this.context = context;
    this.paths = createCreaturePaths();
    this.context.lineJoin = 'round';
    this.context.lineCap = 'round';

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(canvas);
    } else if (typeof window !== 'undefined') {
      this.resizeListener = () => this.resizeCanvas();
      window.addEventListener('resize', this.resizeListener);
    }

    this.resizeCanvas();
  }

  /** Convierte un clic de pantalla (`clientX`, `clientY`) a coordenadas normalizadas `(0..1)`. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  render(state: RenderState): void {
    const { canvas, context, paths } = this;
    if (!canvas || !context || !paths) return;

    const mood = deriveMood(state.drives);
    canvas.dataset.mood = mood;
    canvas.setAttribute(
      'aria-label',
      `Nilo está ${MOOD_LABELS[mood].toLowerCase()}. Criatura virtual dibujada en Canvas.`,
    );

    if (this.width <= 0 || this.height <= 0) this.resizeCanvas();
    if (this.width <= 0 || this.height <= 0) return;

    const time = normalizedTime(state.simTime);
    const breath = 0.5 - 0.5 * Math.cos((FULL_TURN * time) / 3.6);
    const hop = mood === 'excited' ? hopAmount(time) : 0;

    context.clearRect(0, 0, this.width, this.height);

    const spatial = state.world;
    if (!spatial) {
      // Modo retrato clásico (100 % compatible con L1 y tests unitarios).
      const scale = (Math.min(this.width, this.height) / VIEWBOX_SIZE) * 0.92;
      this.drawPositionedCreature(
        context,
        paths,
        mood,
        time,
        breath,
        hop,
        this.width / 2,
        this.height / 2 + 2,
        scale,
        0,
        1,
      );
      return;
    }

    // Modo hábitat espacial (Fase 4): orden por profundidad y escala proporcionada.
    this.drawHabitatZones(context);
    this.drawNavigationGuide(context, spatial);

    const backObjects = spatial.objects.filter((obj) => obj.position.y <= spatial.creaturePosition.y);
    const frontObjects = spatial.objects.filter((obj) => obj.position.y > spatial.creaturePosition.y);

    for (const obj of backObjects) this.drawWorldObject(context, obj, time);

    const speedMag = Math.hypot(spatial.creatureVelocity.x, spatial.creatureVelocity.y);
    const walkAmount = Math.min(1, speedMag / 0.65);
    const depthScale = (0.34 + 0.10 * spatial.creaturePosition.y) * 0.68;
    const scale = (Math.min(this.width, this.height) / VIEWBOX_SIZE) * depthScale;
    const centerX = spatial.creaturePosition.x * this.width;
    const footOffset = 185 * scale;
    const centerY = spatial.creaturePosition.y * this.height - footOffset * 0.68;

    this.drawPositionedCreature(
      context,
      paths,
      mood,
      time,
      breath,
      hop,
      centerX,
      centerY,
      scale,
      walkAmount,
      spatial.heading,
    );

    for (const obj of frontObjects) this.drawWorldObject(context, obj, time);

    if (spatial.speech) {
      this.drawSpeechBubble(context, centerX, centerY - 195 * scale, spatial.speech);
    }
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
    }
    this.resizeListener = null;

    this.canvas?.removeAttribute('data-mood');
    this.canvas = null;
    this.context = null;
    this.paths = null;
    this.width = 0;
    this.height = 0;
  }

  private drawPositionedCreature(
    context: CanvasRenderingContext2D,
    paths: CreaturePaths,
    mood: CreatureMood,
    time: number,
    breath: number,
    hop: number,
    centerX: number,
    centerY: number,
    scale: number,
    walkAmount: number,
    heading: -1 | 1,
  ): void {
    const stride = walkAmount > 0.02 ? Math.sin(FULL_TURN * time * 3.1) * walkAmount : 0;
    const walkBob = walkAmount > 0.02 ? Math.abs(Math.sin(FULL_TURN * time * 3.1)) * 9 * walkAmount : 0;

    context.save();
    context.translate(centerX, centerY);
    context.scale(scale, scale);
    context.translate(-VIEWBOX_SIZE / 2, -VIEWBOX_SIZE / 2);

    // Sombra proyectada en el suelo.
    context.save();
    context.globalAlpha = 0.18 - hop * 0.08 - walkAmount * 0.03;
    context.fillStyle = '#164d42';
    context.shadowColor = 'rgba(22, 77, 66, 0.24)';
    context.shadowBlur = 12;
    context.beginPath();
    context.ellipse(250, 442, 132, 24, 0, 0, FULL_TURN);
    context.fill();
    context.restore();

    const walkLean = walkAmount * 0.045 * heading;
    const tilt =
      (mood === 'sad' ? 0.018 : mood === 'excited' ? -0.04 * hop : 0) + walkLean;
    const breathingScale = 1 + 0.012 * breath;
    context.translate(0, -5 * breath - 28 * hop - walkBob);
    context.translate(250, 420);
    context.rotate(tilt);
    context.scale(breathingScale, 1 + 0.008 * breath);
    context.translate(-250, -420);

    this.drawCreature(context, paths, mood, time, stride, heading);
    context.restore();
  }

  private drawHabitatZones(context: CanvasRenderingContext2D): void {
    const zones = [
      { left: 0, width: 0.32, fill: '#d9c8ab', label: 'DESCANSO' },
      { left: 0.32, width: 0.36, fill: '#c7dccd', label: 'JUEGO Y EXPLORACIÓN' },
      { left: 0.68, width: 0.32, fill: '#c8dce4', label: 'JARDÍN' },
    ];
    context.save();
    for (const zone of zones) {
      const x = zone.left * this.width;
      const width = zone.width * this.width;
      context.globalAlpha = 0.26;
      context.fillStyle = zone.fill;
      context.fillRect(x, 0, width, this.height);
      context.globalAlpha = 0.45;
      context.strokeStyle = '#55706a';
      context.setLineDash([5, 7]);
      context.beginPath(); context.moveTo(x + width, 0); context.lineTo(x + width, this.height); context.stroke();
      context.globalAlpha = 0.86;
      context.setLineDash([]);
      context.font = '700 14px ui-sans-serif, system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = '#31564e';
      context.fillText(zone.label, x + width / 2, 18);
    }
    context.restore();
  }

  private drawNavigationGuide(context: CanvasRenderingContext2D, spatial: SpatialRenderState): void {
    const destination = spatial.targetPosition;
    if (!destination) return;
    const startX = spatial.creaturePosition.x * this.width;
    const startY = spatial.creaturePosition.y * this.height;
    const endX = destination.x * this.width;
    const endY = destination.y * this.height;
    const dist = Math.hypot(endX - startX, endY - startY);
    if (dist < 14) return;

    context.save();
    context.globalAlpha = 0.78;
    context.strokeStyle = '#087f78';
    context.lineWidth = 2.5;
    context.setLineDash([8, 7]);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = '#087f78';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(endX, endY + 14);
    context.lineTo(endX, endY - 18);
    context.stroke();
    context.fillStyle = '#087f78';
    context.beginPath();
    context.moveTo(endX, endY - 18);
    context.lineTo(endX + 20, endY - 11);
    context.lineTo(endX, endY - 3);
    context.closePath();
    context.fill();
    context.restore();
  }

  private drawWorldObject(
    context: CanvasRenderingContext2D,
    obj: RenderWorldObject,
    time: number,
  ): void {
    const x = obj.position.x * this.width;
    const y = obj.position.y * this.height;
    const unit = Math.max(30, Math.min(this.width, this.height) * 0.095);

    context.save();

    if (obj.id === 'nido') {
      // Nido tejido cálido.
      context.globalAlpha = 0.2;
      context.fillStyle = '#164d42';
      context.beginPath();
      context.ellipse(x, y + unit * 0.34, unit * 0.95, unit * 0.3, 0, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 1;
      context.fillStyle = '#d89b52';
      context.strokeStyle = '#8b5d2b';
      context.lineWidth = 2.5;
      context.beginPath();
      context.ellipse(x, y + unit * 0.14, unit * 0.86, unit * 0.42, 0, 0, FULL_TURN);
      context.fill();
      context.stroke();

      context.fillStyle = '#f8e3ba';
      context.beginPath();
      context.ellipse(x, y + unit * 0.08, unit * 0.62, unit * 0.25, 0, 0, FULL_TURN);
      context.fill();
    } else if (obj.id === 'comedero') {
      // Dispensador de comida + indicador de ración lista.
      context.globalAlpha = 0.18;
      context.fillStyle = '#164d42';
      context.beginPath();
      context.ellipse(x, y + unit * 0.4, unit * 0.72, unit * 0.24, 0, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 1;
      context.fillStyle = '#e7f5f0';
      context.strokeStyle = '#287967';
      context.lineWidth = 2.4;
      context.fillRect(x - unit * 0.48, y - unit * 0.68, unit * 0.96, unit * 0.98);
      if (typeof context.strokeRect === 'function') {
        context.strokeRect(x - unit * 0.48, y - unit * 0.68, unit * 0.96, unit * 0.98);
      }

      context.fillStyle = obj.ready ? '#df6d52' : '#9bb0aa';
      context.beginPath();
      context.arc(x, y - unit * 0.26, unit * 0.21, 0, FULL_TURN);
      context.fill();

      context.fillStyle = obj.ready ? '#6cc5b0' : '#c4d2cc';
      context.beginPath();
      context.ellipse(x, y + unit * 0.22, unit * 0.36, unit * 0.14, 0, 0, FULL_TURN);
      context.fill();
    } else if (obj.id === 'pelota') {
      const wobble = !obj.ready ? Math.sin(FULL_TURN * time * 2.8) * 5 : 0;
      context.globalAlpha = 0.18;
      context.fillStyle = '#164d42';
      context.beginPath();
      context.ellipse(x + wobble, y + unit * 0.42, unit * 0.56, unit * 0.18, 0, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 1;
      context.fillStyle = '#f08065';
      context.strokeStyle = '#8f3d2d';
      context.lineWidth = 2.2;
      context.beginPath();
      context.arc(x + wobble, y, unit * 0.46, 0, FULL_TURN);
      context.fill();
      context.stroke();

      context.fillStyle = '#ffd678';
      context.beginPath();
      context.arc(x + wobble - unit * 0.14, y - unit * 0.12, unit * 0.15, 0, FULL_TURN);
      context.fill();
    } else if (obj.id === 'peluche') {
      context.fillStyle = '#ad7652'; context.strokeStyle = '#704632'; context.lineWidth = 2.4;
      context.beginPath(); context.arc(x - unit * 0.23, y - unit * 0.3, unit * 0.2, 0, FULL_TURN); context.arc(x + unit * 0.23, y - unit * 0.3, unit * 0.2, 0, FULL_TURN); context.fill(); context.stroke();
      context.beginPath(); context.ellipse(x, y + unit * 0.08, unit * 0.43, unit * 0.5, 0, 0, FULL_TURN); context.fill(); context.stroke();
      context.fillStyle = '#f4d8b4'; context.beginPath(); context.ellipse(x, y + unit * 0.1, unit * 0.19, unit * 0.13, 0, 0, FULL_TURN); context.fill();
      context.fillStyle = '#382b27'; context.beginPath(); context.arc(x - unit * 0.13, y - unit * 0.03, 2.2, 0, FULL_TURN); context.arc(x + unit * 0.13, y - unit * 0.03, 2.2, 0, FULL_TURN); context.fill();
    } else if (obj.id === 'tunel') {
      context.fillStyle = '#d28a62'; context.strokeStyle = '#8e563f'; context.lineWidth = 3;
      context.beginPath(); context.moveTo(x - unit * 0.75, y + unit * 0.35); context.lineTo(x - unit * 0.75, y - unit * 0.08); context.quadraticCurveTo(x, y - unit * 0.95, x + unit * 0.75, y - unit * 0.08); context.lineTo(x + unit * 0.75, y + unit * 0.35); context.closePath(); context.fill(); context.stroke();
      context.fillStyle = '#493e39'; context.beginPath(); context.ellipse(x, y + unit * 0.25, unit * 0.48, unit * 0.18, 0, 0, FULL_TURN); context.fill();
    } else if (obj.id === 'ventana') {
      context.fillStyle = '#fff8e9'; context.strokeStyle = '#8e6844'; context.lineWidth = 4;
      context.fillRect(x - unit * 0.65, y - unit * 0.78, unit * 1.3, unit * 1.15); context.strokeRect(x - unit * 0.65, y - unit * 0.78, unit * 1.3, unit * 1.15);
      context.fillStyle = '#b9e3ed'; context.fillRect(x - unit * 0.5, y - unit * 0.63, unit, unit * 0.85);
      context.fillStyle = '#77ad77'; context.fillRect(x - unit * 0.5, y + unit * 0.06, unit, unit * 0.16);
      context.strokeStyle = '#8e6844'; context.lineWidth = 3; context.beginPath(); context.moveTo(x, y - unit * 0.63); context.lineTo(x, y + unit * 0.21); context.moveTo(x - unit * 0.5, y - unit * 0.18); context.lineTo(x + unit * 0.5, y - unit * 0.18); context.stroke();
    } else if (obj.id === 'xilofono') {
      const colors = ['#e87d65', '#e9b958', '#76b5a3', '#7e9fc6', '#b58ab8'];
      colors.forEach((color, index) => { const barX = x - unit * 0.62 + index * unit * 0.3; const barY = y - unit * 0.1 + Math.abs(index - 2) * unit * 0.09; context.fillStyle = color; context.fillRect(barX, barY, unit * 0.24, unit * 0.17); context.strokeStyle = '#785d43'; context.strokeRect(barX, barY, unit * 0.24, unit * 0.17); });
      context.strokeStyle = '#9c6948'; context.lineWidth = 3; context.beginPath(); context.moveTo(x - unit * 0.52, y + unit * 0.16); context.lineTo(x - unit * 0.72, y + unit * 0.47); context.moveTo(x + unit * 0.52, y + unit * 0.16); context.lineTo(x + unit * 0.72, y + unit * 0.47); context.stroke();
    } else {
      // Lámpara de luz suave suspendida con haz volumétrico cálido.
      const glow = 0.55 + 0.3 * Math.sin(FULL_TURN * time * 0.75);
      context.save();
      context.globalAlpha = 0.14 * glow;
      context.fillStyle = '#ffd678';
      context.beginPath();
      context.ellipse(x, y + unit * 1.15, unit * 1.25, unit * 1.5, 0, 0, FULL_TURN);
      context.fill();
      context.restore();

      context.fillStyle = '#287967';
      context.fillRect(x - 1.5, 0, 3, Math.max(0, y - unit * 0.45));

      context.globalAlpha = 0.32 * glow;
      context.fillStyle = '#ffd678';
      context.beginPath();
      context.arc(x, y, unit * 0.72, 0, FULL_TURN);
      context.fill();

      context.globalAlpha = 1;
      context.fillStyle = '#fff5cf';
      context.strokeStyle = '#c8922b';
      context.lineWidth = 2.2;
      context.beginPath();
      context.arc(x, y, unit * 0.38, 0, FULL_TURN);
      context.fill();
      context.stroke();
    }

    if (typeof context.fillText === 'function') {
      context.save();
      const labelWidth = Math.max(unit * 1.25, obj.name.length * 7.6 + 22);
      const labelY = y + unit * 0.72;
      context.globalAlpha = 0.9;
      context.fillStyle = '#fbfdfb';
      context.fillRect(x - labelWidth / 2, labelY - 18, labelWidth, 25);
      context.font = '700 14px ui-sans-serif, system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = '#14221f';
      context.globalAlpha = 1;
      context.fillText(obj.name, x, labelY);
      context.restore();
    }

    context.restore();
  }

  private drawSpeechBubble(
    context: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    text: string,
  ): void {
    if (typeof context.fillText !== 'function') return;
    const trimmed = text.length > 42 ? `${text.slice(0, 41)}…` : text;
    const bubbleWidth = Math.min(this.width - 24, Math.max(118, trimmed.length * 6.5 + 24));
    const bubbleHeight = 28;
    const bx = Math.min(
      this.width - bubbleWidth - 12,
      Math.max(12, anchorX - bubbleWidth / 2),
    );
    const by = Math.max(10, anchorY - bubbleHeight);

    context.save();
    context.globalAlpha = 0.92;
    context.fillStyle = '#fbfdfb';
    context.strokeStyle = '#48a892';
    context.lineWidth = 1.5;
    context.fillRect(bx, by, bubbleWidth, bubbleHeight);
    if (typeof context.strokeRect === 'function') {
      context.strokeRect(bx, by, bubbleWidth, bubbleHeight);
    }
    context.fillStyle = '#14221f';
    context.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillText(trimmed, bx + bubbleWidth / 2, by + 18);
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

  private drawCreature(
    context: CanvasRenderingContext2D,
    paths: CreaturePaths,
    mood: CreatureMood,
    time: number,
    stride = 0,
    heading: -1 | 1 = 1,
  ): void {
    const bodyGradient = context.createRadialGradient(190, 150, 12, 250, 265, 250);
    bodyGradient.addColorStop(0, '#d6fff2');
    bodyGradient.addColorStop(0.58, '#7ed4bd');
    bodyGradient.addColorStop(1, '#329681');

    const bellyGradient = context.createRadialGradient(220, 315, 4, 250, 337, 82);
    bellyGradient.addColorStop(0, '#f9dfab');
    bellyGradient.addColorStop(1, '#e4a94d');

    context.save();
    context.strokeStyle = '#287967';
    context.lineWidth = 5;

    // Antenas y brillo (la pulsación es periódica y depende del tiempo simulado).
    context.strokeStyle = '#48a892';
    context.lineWidth = 18;
    context.stroke(paths.antennaLeft);
    context.stroke(paths.antennaRight);
    const glowPulse = 0.58 + 0.28 * (0.5 + 0.5 * Math.sin((FULL_TURN * time) / 1.9));
    this.drawAntennaGlow(context, 151, 43, glowPulse);
    this.drawAntennaGlow(context, 351, 45, glowPulse);

    // Brazos y pies con oscilación antifase al caminar.
    context.fillStyle = bodyGradient;
    context.strokeStyle = '#287967';
    context.lineWidth = 5;

    context.save();
    context.translate(0, -stride * 10);
    context.fill(paths.armLeft);
    context.stroke(paths.armLeft);
    context.restore();

    context.save();
    context.translate(0, stride * 10);
    context.fill(paths.armRight);
    context.stroke(paths.armRight);
    context.restore();

    context.save();
    context.translate(stride * 12, Math.min(0, -stride * 14));
    context.fill(paths.legLeft);
    context.stroke(paths.legLeft);
    context.restore();

    context.save();
    context.translate(-stride * 12, Math.min(0, stride * 14));
    context.fill(paths.legRight);
    context.stroke(paths.legRight);
    context.restore();

    // Cuerpo y detalles principales.
    context.fillStyle = bodyGradient;
    context.lineWidth = 6;
    context.fill(paths.body);
    context.stroke(paths.body);

    context.globalAlpha = 0.8;
    context.fillStyle = bellyGradient;
    context.beginPath();
    context.ellipse(250, 337, 79, 67, 0, 0, FULL_TURN);
    context.fill();
    context.globalAlpha = 1;

    context.fillStyle = '#6cc5b0';
    context.strokeStyle = '#287967';
    context.lineWidth = 5;
    context.fill(paths.earLeft);
    context.stroke(paths.earLeft);
    context.fill(paths.earRight);
    context.stroke(paths.earRight);

    const blink = blinkAmount(time);
    const baseEyeOpen = mood === 'sleepy' ? 0.23 : 1;
    const eyeOpen = Math.max(0.08, baseEyeOpen * (1 - blink * 0.94));
    const pupilOffset = mood === 'sad' ? 7 : mood === 'excited' ? -2 : 0;
    const gazeShift = Math.abs(stride) > 0.05 ? heading * 5 : 0;
    this.drawEye(context, 195, 200 + gazeShift, eyeOpen, pupilOffset);
    this.drawEye(context, 305, 300 + gazeShift, eyeOpen, pupilOffset);

    // Los párpados suaves del SVG original; al dormir quedan casi cerrados.
    context.save();
    context.globalAlpha = mood === 'sleepy' ? 0.42 : 0.18;
    context.fillStyle = '#409b87';
    context.fillRect(149, 182, 95, 7);
    context.fillRect(257, 182, 95, 7);
    context.restore();

    context.strokeStyle = '#26695b';
    context.lineWidth = 5;
    context.stroke(paths.nose);
    this.drawMouth(context, paths, mood);

    const cheekOpacity = mood === 'excited' ? 0.36 : mood === 'happy' ? 0.25 : 0.13;
    context.save();
    context.globalAlpha = cheekOpacity;
    context.fillStyle = '#e87565';
    context.beginPath();
    context.arc(158, 278, 17, 0, FULL_TURN);
    context.arc(342, 278, 17, 0, FULL_TURN);
    context.fill();
    context.restore();

    context.save();
    context.globalAlpha = 0.8;
    context.fillStyle = '#ebbe62';
    for (const [x, y, radius] of [
      [181, 121, 6],
      [211, 109, 4],
      [290, 109, 5],
      [322, 124, 7],
    ]) {
      context.beginPath();
      context.arc(x, y, radius, 0, FULL_TURN);
      context.fill();
    }
    context.restore();
    context.restore();
  }

  private drawAntennaGlow(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    pulse: number,
  ): void {
    context.save();
    context.globalAlpha = 0.28 * pulse;
    context.fillStyle = '#eab552';
    context.beginPath();
    context.arc(x, y, 18, 0, FULL_TURN);
    context.fill();
    context.globalAlpha = pulse;
    context.fillStyle = '#ffd678';
    context.beginPath();
    context.arc(x, y, 9, 0, FULL_TURN);
    context.fill();
    context.restore();
  }

  private drawEye(
    context: CanvasRenderingContext2D,
    centerX: number,
    pupilX: number,
    openAmount: number,
    pupilOffset: number,
  ): void {
    context.save();
    context.translate(centerX, 213);
    context.scale(1, openAmount);
    context.translate(-centerX, -213);

    context.beginPath();
    context.ellipse(centerX, 213, 48, 55, 0, 0, FULL_TURN);
    context.fillStyle = '#f4fffc';
    context.fill();
    context.strokeStyle = '#287967';
    context.lineWidth = 5;
    context.stroke();

    context.beginPath();
    context.ellipse(pupilX, 220 + pupilOffset, 23, 29, 0, 0, FULL_TURN);
    context.fillStyle = '#133832';
    context.fill();

    if (openAmount > 0.4) {
      context.beginPath();
      context.arc(pupilX + 10, 208 + pupilOffset, 7, 0, FULL_TURN);
      context.fillStyle = '#ffffff';
      context.fill();
    }
    context.restore();
  }

  private drawMouth(
    context: CanvasRenderingContext2D,
    paths: CreaturePaths,
    mood: CreatureMood,
  ): void {
    context.save();
    context.strokeStyle = '#174d43';
    context.lineWidth = mood === 'sleepy' ? 5 : 7;

    if (mood === 'happy' || mood === 'excited') {
      if (mood === 'excited') {
        context.translate(250, 312);
        context.scale(1.16, 1.16);
        context.translate(-250, -312);
      }
      context.fillStyle = '#ce654e';
      context.fill(paths.mouthHappy);
      context.stroke(paths.mouthHappy);
    } else {
      if (mood === 'sad') {
        context.translate(250, 312);
        context.rotate(Math.PI);
        context.translate(-250, -312);
      } else {
        context.translate(250, 312);
        context.scale(1, 0.58);
        context.translate(-250, -312);
      }
      context.stroke(paths.mouthNeutral);
    }
    context.restore();
  }
}
