/**
 * Stub desechable del contrato IBrain.
 *
 * ⚠️ Este archivo histórico es temporal: sirve para que la Fase 0 compile
 * contra IBrain y para pruebas. La app actual usa `PlaceholderBrain` tras el
 * adaptador; no guardar estado ni acoplar el stub a otros módulos.
 */
import type { BrainInputs, BrainOutput, IBrain } from '../contracts/ibrain';

export class StubBrain implements IBrain {
  /** Siempre neutro: cero acciones, sin estado. Desechar al llegar el cerebro real. */
  think(_inputs: BrainInputs): BrainOutput {
    return { actions: [] };
  }
}
