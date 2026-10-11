/**
 * Contrato del motor de bioquímica.
 * Lo implementa src/biochem/engine.ts (Fase 0). Consumidores: cerebro (lee
 * inputs) y visuales (leen el snapshot para dibujar).
 */
import type { ChemicalId, DriveId, DriveState, TickResult } from './types';

export interface IBiochem {
  /**
   * Avanza la simulación `dtSeconds` segundos.
   * Puro y determinista: mismas condiciones iniciales + mismo dt ⇒ mismo resultado.
   * @throws RangeError si dtSeconds < 0.
   */
  tick(dtSeconds: number): TickResult;

  /** Estado de un drive. @throws RangeError si el id no está registrado. */
  getDrive(id: DriveId): DriveState;

  /** Nivel de un químico (0..1). @throws RangeError si el id no está registrado. */
  getChemical(id: ChemicalId): number;
}
