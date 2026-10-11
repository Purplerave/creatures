/**
 * Contrato del puerto de render (visuales).
 *
 * Fase 0: PLACEHOLDER — sin implementar. Tecnotron portará aquí los visuales
 * de Bichito; mientras tanto src/main.ts dibuja un render de prueba directo
 * sobre el canvas (no implementa esta interfaz a propósito).
 *
 * Quien lo implemente recibe snapshots de IBiochem.tick() y no toca la lógica
 * de simulación: el render es un puerto, no una fuente de verdad.
 */
import type { ChemicalId, DriveId, DriveState } from './types';

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
}

export interface IVisuals {
  /** Adjunta el render a un canvas (crea capas internas si hace falta). */
  mount(canvas: HTMLCanvasElement): void;
  /** Dibuja un fotograma a partir de un snapshot. */
  render(state: RenderState): void;
  /** Libera listeners/recursos. */
  unmount(): void;
}
