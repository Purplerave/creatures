/**
 * Contrato del puerto de render (visuales).
 *
 * Quien lo implemente recibe snapshots de IBiochem.tick() (y opcionalmente
 * el snapshot espacial de solo lectura del mundo) y no toca la lógica de
 * simulación: el render es un puerto de solo lectura, no una fuente de verdad.
 */
import type { ChemicalId, DriveId, DriveState } from './types';

/** Objeto interactivo visible en el escenario del hábitat (solo lectura). */
export interface RenderWorldObject {
  id: string;
  name: string;
  icon: string;
  position: { x: number; y: number };
  cooldownRemaining: number;
  cooldownSeconds: number;
  uses: number;
  ready: boolean;
  inRange: boolean;
}

/** Estado espacial de solo lectura para dibujar el hábitat y el desplazamiento. */
export interface SpatialRenderState {
  creaturePosition: { x: number; y: number };
  creatureVelocity: { x: number; y: number };
  heading: -1 | 1;
  targetObjectId: string | null;
  /** Destination for a manual floor click or an object action. */
  targetPosition?: { x: number; y: number } | null;
  activeObjectId: string | null;
  objects: readonly RenderWorldObject[];
  speech?: string;
}

/** Todo lo que el render necesita para dibujar un fotograma. */
export interface RenderState {
  /** Fotograma actual. */
  frame: number;
  /** Estado de los drives. */
  drives: Record<DriveId, DriveState>;
  /** Niveles de los químicos. */
  chemicals: Record<ChemicalId, number>;
  /** Tiempo simulado acumulado (segundos). */
  simTime: number;
  /** Snapshot espacial opcional del mundo (Fase 4). Si se omite, Nilo se centra. */
  world?: SpatialRenderState;
}

export interface IVisuals {
  /** Adjunta el render a un canvas (crea capas internas si hace falta). */
  mount(canvas: HTMLCanvasElement): void;
  /** Dibuja un fotograma a partir de un snapshot. */
  render(state: RenderState): void;
  /** Libera listeners/recursos. */
  unmount(): void;
}
