/**
 * D1/D2 — test de interfaz del adaptador: la superficie pública es
 * `IBrain.think()` + `reinforce()` (cerebro encapsulado y desechable) más la
 * EXCEPCIÓN D2 `getDebugState()`:
 *
 * ⚠️ EXCEPCIÓN AUTORIZADA Y ACOTADA — la CEO pidió (tarea D2) exponer
 * `getDebugState()` como puerto de depuración explícito para alimentar la
 * vista de depuración `src/render/brain-view.ts` (tarea L2 de lmarena). Esto
 * contradice la regla de «no getters ni propiedades que filtren el MLP», por
 * lo que se deja constancia aquí: es una excepción deliberada, limitada al
 * contrato `BrainDebugState` (acción/confianza/explored + arrays de debug
 * documentados, hoy vacíos porque no hay MLP real en el repo) y no autoriza
 * nuevos accesos al interior del cerebro.
 */
import { describe, expect, it } from 'vitest';
import { BrainV05Adapter } from '../src/brain/adapter';
import type { IBrain } from '../src/contracts/ibrain';
import { FakeBrain } from './fake-brain';

describe('adaptador — interfaz pública', () => {
  it('expone exactamente think + reinforce + getDebugState (excepción D2 documentada)', () => {
    const names = Object.getOwnPropertyNames(BrainV05Adapter.prototype)
      .filter((n) => n !== 'constructor')
      .sort();
    // getDebugState = puerto de depuración explícito autorizado (ver cabecera).
    expect(names).toEqual(['getDebugState', 'reinforce', 'think']);
  });

  it('no define getters/setters en el prototipo (nada que filtre internals)', () => {
    const descriptors = Object.getOwnPropertyDescriptors(BrainV05Adapter.prototype);
    for (const [name, desc] of Object.entries(descriptors)) {
      if (name === 'constructor') continue;
      // getDebugState es un MÉTODO (llamada explícita), no un getter: la
      // regla de «sin getters» se mantiene; la excepción es solo el método.
      expect(desc.get, `getter inesperado: ${name}`).toBeUndefined();
      expect(desc.set, `setter inesperado: ${name}`).toBeUndefined();
    }
  });

  it('el estado propio es solo el cerebro inyectado + mapeos + último think', () => {
    const adapter = new BrainV05Adapter(new FakeBrain());
    const own = Object.keys(adapter).sort();
    expect(own).toEqual(['brain', 'driveOrder', 'lastThink', 'mapGenome', 'mapStimuli']);
    // Ningún campo expone MLP/pesos/capas (el cerebro encapsulado vive detrás de think/reinforce).
    expect(own.some((k) => /mlp|weight|layer|neuron|param/i.test(k))).toBe(false);
  });

  it('satisface IBrain en tiempo de compilación y funciona como tal', () => {
    const asIBrain: IBrain = new BrainV05Adapter(new FakeBrain());
    const out = asIBrain.think({ drives: {}, chemicals: {}, tick: 0 });
    expect(Array.isArray(out.actions)).toBe(true);
    expect(typeof out.actions[0]).toBe('number');
  });
});
