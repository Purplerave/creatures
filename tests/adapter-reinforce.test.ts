/**
 * D1 — tests de `reinforce(reward)` del adaptador:
 * refuerza la ÚLTIMA acción de think(), recorta el reward a [-1,1] y
 * no lanza si aún no se ha llamado a think().
 */
import { describe, expect, it } from 'vitest';
import { BrainV05Adapter } from '../src/brain/adapter';
import type { BrainInputs } from '../src/contracts/ibrain';
import { FakeBrain } from './fake-brain';

const INPUTS: BrainInputs = { drives: {}, chemicals: {}, tick: 0 };

describe('adaptador — reinforce', () => {
  it('tras think(), refuerza exactamente la última acción con el reward dado', () => {
    const fake = new FakeBrain();
    fake.next = { action: 2, actionName: 'comer', confidence: 0.5, explored: false };
    const adapter = new BrainV05Adapter(fake);

    adapter.think(INPUTS);
    adapter.reinforce(0.5);

    expect(fake.reinforceCalls).toEqual([{ action: 2, reward: 0.5 }]);
  });

  it('usa la ÚLTIMA acción si hubo varios think()', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);

    fake.next = { action: 1, actionName: 'jugar', confidence: 0, explored: false };
    adapter.think(INPUTS);
    fake.next = { action: 3, actionName: 'dormir', confidence: 0, explored: false };
    adapter.think(INPUTS);
    adapter.reinforce(-0.25);

    expect(fake.reinforceCalls).toEqual([{ action: 3, reward: -0.25 }]);
  });

  it('recorta el reward a [-1,1]', () => {
    const fake = new FakeBrain();
    fake.next = { action: 0, actionName: 'neutro', confidence: 0, explored: false };
    const adapter = new BrainV05Adapter(fake);

    adapter.think(INPUTS);
    adapter.reinforce(5);
    adapter.reinforce(-3);

    expect(fake.reinforceCalls.map((c) => c.reward)).toEqual([1, -1]);
  });

  it('reinforce SIN think() previo no lanza y no llama al cerebro', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);

    expect(() => adapter.reinforce(1)).not.toThrow();
    expect(fake.reinforceCalls).toEqual([]);
  });
});
