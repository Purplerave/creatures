/**
 * D1 — test de interfaz del adaptador: la superficie pública es SOLO
 * `IBrain.think()` + `reinforce()` (cerebro encapsulado y desechable).
 * No hay getters ni propiedades que filtren el MLP/internals del cerebro.
 */
import { describe, expect, it } from 'vitest';
import { BrainV05Adapter } from '../src/brain/adapter';
import type { IBrain } from '../src/contracts/ibrain';
import { FakeBrain } from './fake-brain';

describe('adaptador — interfaz pública', () => {
  it('expone exactamente think + reinforce (los métodos de IBrain + reinforce)', () => {
    const names = Object.getOwnPropertyNames(BrainV05Adapter.prototype)
      .filter((n) => n !== 'constructor')
      .sort();
    expect(names).toEqual(['reinforce', 'think']);
  });

  it('no define getters/setters en el prototipo (nada que filtre internals)', () => {
    const descriptors = Object.getOwnPropertyDescriptors(BrainV05Adapter.prototype);
    for (const [name, desc] of Object.entries(descriptors)) {
      if (name === 'constructor') continue;
      expect(desc.get, `getter inesperado: ${name}`).toBeUndefined();
      expect(desc.set, `setter inesperado: ${name}`).toBeUndefined();
    }
  });

  it('el estado propio es solo el cerebro inyectado + mapeos + última acción', () => {
    const adapter = new BrainV05Adapter(new FakeBrain());
    const own = Object.keys(adapter).sort();
    expect(own).toEqual(['brain', 'driveOrder', 'lastAction', 'mapGenome', 'mapStimuli']);
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
