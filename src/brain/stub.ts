/**
 * Stub desechable del contrato IBrain.
 *
 * ⚠️ Este archivo es temporal: lo sustituirá el cerebro real de Tecnotron
 * (MLP + exploración épsilon). No guardar estado aquí ni acoplarlo a nada;
 * solo existe para que la Fase 0 compile contra IBrain y para pruebas.
 */
import type { BrainInputs, BrainOutput, IBrain } from '../contracts/ibrain';

export class StubBrain implements IBrain {
  /** Siempre neutro: cero acciones, sin estado. Desechar al llegar el cerebro real. */
  think(_inputs: BrainInputs): BrainOutput {
    return { actions: [] };
  }
}
