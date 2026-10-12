import { describe, expect, it } from 'vitest';
import type { BrainKnobConfig } from '../src/contracts/igenome';
import { Genome } from '../src/genome';
import { createBrainRuntime } from '../src/brain/runtime';
import { FakeBrain } from './fake-brain';

describe('createBrainRuntime', () => {
  it('pasa el fenotipo a la fábrica y mapea el genoma en el orden provisional', () => {
    const genome = new Genome({
      genes: {
        alerta: 0.11,
        sociabilidad: 0.22,
        resiliencia: 0.33,
        metabolismo: 0.44,
        capacidad: 0.75,
        exploracion: 0.25,
        aprendizaje: 0.6,
      },
    });
    const fakeBrain = new FakeBrain();
    let receivedKnobs: BrainKnobConfig | undefined;

    const runtime = createBrainRuntime(genome, (knobs) => {
      receivedKnobs = knobs;
      return fakeBrain;
    });

    runtime.brain.think({ drives: {}, chemicals: {}, tick: 1 });

    expect(receivedKnobs).toEqual(genome.getPhenotype().brain);
    expect(runtime.phenotype).toEqual(genome.getPhenotype());
    expect(runtime.genomeInputGenes).toEqual([
      'alerta',
      'sociabilidad',
      'resiliencia',
      'metabolismo',
    ]);
    expect(fakeBrain.thinkCalls[0]?.genome).toEqual([0.11, 0.22, 0.33, 0.44]);
  });

  it('lee los genes actuales en cada think()', () => {
    const genome = new Genome();
    const fakeBrain = new FakeBrain();
    const runtime = createBrainRuntime(genome, () => fakeBrain);

    runtime.brain.think({ drives: {}, chemicals: {}, tick: 1 });
    genome.deserialize(JSON.stringify({
      genes: { alerta: 0.9, sociabilidad: 0.8, resiliencia: 0.7, metabolismo: 0.6 },
    }));
    runtime.brain.think({ drives: {}, chemicals: {}, tick: 2 });

    expect(fakeBrain.thinkCalls[0]?.genome).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(fakeBrain.thinkCalls[1]?.genome).toEqual([0.9, 0.8, 0.7, 0.6]);
  });

  it('permite configurar mapeos alternativos de genes y estímulos', () => {
    const genome = new Genome({ genes: { metabolismo: 0.8, alerta: 0.3 } });
    const fakeBrain = new FakeBrain();
    const runtime = createBrainRuntime(genome, () => fakeBrain, {
      genomeInputGenes: ['metabolismo', 'alerta', 'metabolismo', 'alerta'],
      mapStimuli: ({ chemicals }) => [chemicals.dopamina ?? 0, chemicals.serotonina ?? 0, 0.25],
    });

    runtime.brain.think({
      drives: {},
      chemicals: { dopamina: 0.7, serotonina: 0.4 },
      tick: 2,
    });

    expect(fakeBrain.thinkCalls[0]?.genome).toEqual([0.8, 0.3, 0.8, 0.3]);
    expect(fakeBrain.thinkCalls[0]?.stimuli).toEqual([0.7, 0.4, 0.25]);
  });
});
