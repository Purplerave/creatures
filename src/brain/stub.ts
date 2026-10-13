/**
 * Stub desechable del contrato IBrain.
 *
 * Archivo histórico de Fase 0 para pruebas del contrato IBrain. La app actual
 * usa `BrainV05` detrás de `BrainV05Adapter`; este stub neutro no participa en
 * el runtime y no debe ganar estado ni acoplarse a otros módulos.
 */
import type { BrainInputs, BrainOutput, IBrain } from '../contracts/ibrain';

export class StubBrain implements IBrain {
  /** Siempre neutro: cero acciones, sin estado. Desechar al llegar el cerebro real. */
  think(_inputs: BrainInputs): BrainOutput {
    return { actions: [] };
  }
}
