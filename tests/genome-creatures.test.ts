/**
 * Tests de F2 «Genoma Creatures» (`docs/VISION-SUPER-BESTIA.md`):
 * cabeceras ricas (`switchOnTime`, `mutability`, `critical`, `expressed`),
 * protección absoluta de genes críticos frente a borrado pero mutación/borrado
 * libre de duplicados, metilación epigenética reversible (1 bit) y `crossover`.
 */
import { describe, expect, it } from 'vitest';
import { Genome, hasGene, registerGene, resolveGeneHeader, getGeneDef } from '../src/genome';

describe('F2 «Genoma Creatures» y epigenética', () => {
  it('ontogenia switchOnTime: un gen tardío permanece silenciado hasta alcanzar su edad', () => {
    const id = 'gen-adulto-ontogenia';
    if (!hasGene(id)) {
      registerGene({
        id,
        label: 'Vigor adulto',
        description: 'Solo se enciende en etapa adulta (120 s)',
        defaultWeight: 0.5,
        range: [0, 1],
        drives: [{ driveId: 'energia', weight: -0.5 }],
        header: { family: 'metabolism', switchOnTime: 120 },
      });
    }

    const genome = new Genome({ genes: { [id]: 1 } });
    const embryonic = genome.getPhenotype({ ageSeconds: 10 });
    const adult = genome.getPhenotype({ ageSeconds: 150 });

    // A los 10 s aún no se expresa; a los 150 s aporta −0.5 al decay de energía.
    expect(embryonic.driveDecayDeltas.energia ?? 0).toBeCloseTo(0, 12);
    expect(adult.driveDecayDeltas.energia ?? 0).toBeCloseTo(-0.5, 12);
  });

  it('protege siempre la copia 0 de genes críticos mientras duplica y depura copias extra', () => {
    const genome = new Genome({ seed: 77 });

    // Incluso con deletionRate = 1, ningún gen crítico pierde jamás su copia primaria.
    for (let round = 1; round <= 25; round++) {
      genome.mutateStructural(round * 1337, 1, {
        duplicationRate: 0.45,
        deletionRate: 1.0,
      });
    }

    const loci = genome.getLoci();
    for (const criticalId of ['metabolismo', 'capacidad', 'aprendizaje']) {
      expect(resolveGeneHeader(getGeneDef(criticalId)).critical).toBe(true);
      expect(loci.some((l) => l.geneId === criticalId && l.copyIndex === 0)).toBe(true);
    }
  });

  it('la metilación de 1 bit silencia y restaura reversiblemente un gen sin mutar su secuencia', () => {
    const genome = new Genome({ genes: { metabolismo: 1 }, seed: 9 });
    const sequenceBefore = genome.getGene('metabolismo');
    const activePhenotype = genome.getPhenotype();
    expect(activePhenotype.driveDecayDeltas.hambre).toBeCloseTo(0.4, 12);

    genome.setMethylation('metabolismo', true);
    expect(genome.isMethylated('metabolismo')).toBe(true);
    expect(genome.getGene('metabolismo')).toBe(sequenceBefore);
    expect(genome.getPhenotype().driveDecayDeltas.hambre).toBeCloseTo(0, 12);

    // Persiste en JSON y sigue siendo 100 % reversible.
    const reloaded = new Genome();
    reloaded.deserialize(genome.serialize());
    expect(reloaded.isMethylated('metabolismo')).toBe(true);
    reloaded.setMethylation('metabolismo', false);
    expect(reloaded.getPhenotype().driveDecayDeltas.hambre).toBeCloseTo(0.4, 12);
  });

  it('Genome.crossover hereda determinísticamente entre dos progenitores y sube la generación', () => {
    const parentA = new Genome({ genes: { alerta: 0.9, calma: 0.1 }, seed: 10 });
    const parentB = new Genome({ genes: { alerta: 0.2, calma: 0.85 }, seed: 20, generation: 3 });

    const child1 = Genome.crossover(parentA, parentB, 202610, 0.2);
    const child2 = Genome.crossover(parentA, parentB, 202610, 0.2);

    expect(child1.serialize()).toBe(child2.serialize());
    expect(child1.getGeneration()).toBe(4);
  });
});
