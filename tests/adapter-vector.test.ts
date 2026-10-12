/**
 * D1 — tests del VECTOR de entrada y del mapeo de salida del adaptador:
 * orden de drives 0..1, stimuli/genoma por providers (incl. default) y
 * rango [-1,1] de `BrainOutput.actions` con explorado y no explorado.
 */
import { describe, expect, it } from 'vitest';
import { BrainV05Adapter, DRIVE_ORDER, GENOME_DEFAULT } from '../src/brain/adapter';
import { listDriveDefs } from '../src/biochem/driveTable';
import type { BrainInputs } from '../src/contracts/ibrain';
import type { DriveId, DriveState } from '../src/contracts/types';
import { FakeBrain } from './fake-brain';

function inputs(levels: Record<string, number>, chemicals: Record<string, number> = {}): BrainInputs {
  const drives: Record<DriveId, DriveState> = {};
  for (const [id, level] of Object.entries(levels)) drives[id] = { level, target: level };
  return { drives, chemicals, tick: 7 };
}

describe('adaptador — vector de entrada', () => {
  it('usa el orden fijo de los 8 drives de driveTable', () => {
    expect(DRIVE_ORDER).toHaveLength(8);
    expect([...DRIVE_ORDER]).toEqual(listDriveDefs().map((d) => d.id));
    expect(new Set(DRIVE_ORDER).size).toBe(8);
  });

  it('mapea cada drive a su nivel (0..1) en el orden fijo', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);
    adapter.think(
      inputs({
        hambre: 0.9,
        energia: 0.8,
        sueno: 0.7,
        curiosidad: 0.6,
        vinculo: 0.5,
        aburrimiento: 0.4,
        miedo: 0.3,
        confort: 0.2,
      }),
    );

    expect(fake.thinkCalls[0].drives).toEqual([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  });

  it('recorta niveles fuera de 0..1 y rellena drives ausentes con 0', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);
    adapter.think(inputs({ hambre: 1.7, miedo: -0.4 }));

    const drives = fake.thinkCalls[0].drives;
    expect(drives).toHaveLength(8);
    expect(drives[0]).toBe(1); // hambre recortada
    expect(drives[6]).toBe(0); // miedo recortado
    expect(drives[1]).toBe(0); // energia ausente ⇒ 0
  });

  it('respeta un driveOrder personalizado', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake, { driveOrder: ['confort', 'miedo'] });
    adapter.think(inputs({ confort: 0.25, miedo: 0.75 }));
    expect(fake.thinkCalls[0].drives).toEqual([0.25, 0.75]);
  });
});

describe('adaptador — stimuli y genoma', () => {
  it('por defecto stimuli = [dopamina, cortisol, adenosina] normalizados', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);
    adapter.think(inputs({ hambre: 0.5 }, { dopamina: 0.6, cortisol: 0.3, adenosina: 0.9, glucosa: 0.1 }));

    expect(fake.thinkCalls[0].stimuli).toEqual([0.6, 0.3, 0.9]);
    expect(fake.thinkCalls[0].stimuli).toHaveLength(3);
  });

  it('stimuli: químicos ausentes ⇒ 0 y fuera de rango ⇒ recortado', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);
    adapter.think(inputs({}, { dopamina: 2.5 }));
    expect(fake.thinkCalls[0].stimuli).toEqual([1, 0, 0]);
  });

  it('acepta un mapStimuli propio', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake, {
      mapStimuli: (b) => [b.tick / 10, 0.5, 0.25],
    });
    adapter.think(inputs({}));
    expect(fake.thinkCalls[0].stimuli).toEqual([0.7, 0.5, 0.25]);
  });

  it('por defecto el genoma es [0,0,0,0] (pendiente de cablear)', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake);
    adapter.think(inputs({ hambre: 0.1 }));
    expect(fake.thinkCalls[0].genome).toEqual([...GENOME_DEFAULT]);
    expect(fake.thinkCalls[0].genome).toHaveLength(4);
  });

  it('acepta un mapGenome propio: usa sus 4 valores, recorta/pilla y normaliza', () => {
    const fake = new FakeBrain();
    const adapter = new BrainV05Adapter(fake, { mapGenome: () => [0.1, 0.2, 0.3, 0.4, 0.99] });
    adapter.think(inputs({}));
    expect(fake.thinkCalls[0].genome).toEqual([0.1, 0.2, 0.3, 0.4]);

    const fake2 = new FakeBrain();
    const short2 = new BrainV05Adapter(fake2, { mapGenome: () => [5, -1] });
    short2.think(inputs({}));
    expect(fake2.thinkCalls[0].genome).toEqual([1, 0, 0, 0]);
  });

  it('mapGenome recibe las BrainInputs crudas', () => {
    const fake = new FakeBrain();
    let seenTick = -1;
    const adapter = new BrainV05Adapter(fake, {
      mapGenome: (b) => {
        seenTick = b.tick;
        return [0, 0, 0, 0];
      },
    });
    adapter.think(inputs({}));
    expect(seenTick).toBe(7);
  });
});

describe('adaptador — salida BrainOutput', () => {
  it('mapea la acción a actions en [-1,1] (caso explorado)', () => {
    const fake = new FakeBrain();
    fake.next = { action: 0.75, actionName: 'jugar', confidence: 0.8, explored: true };
    const adapter = new BrainV05Adapter(fake);

    const out = adapter.think(inputs({}));
    expect(out.actions).toEqual([0.75]);
    expect(out.actions.every((v) => v >= -1 && v <= 1)).toBe(true);
    expect(out.debug).toEqual({ confidence: 0.8, explored: 1 });
  });

  it('mapea la acción a actions en [-1,1] (caso NO explorado) y recorta', () => {
    const fake = new FakeBrain();
    fake.next = { action: -3, actionName: 'dormir', confidence: 1.4, explored: false };
    const adapter = new BrainV05Adapter(fake);

    const out = adapter.think(inputs({}));
    expect(out.actions).toEqual([-1]); // recorte a [-1,1]
    expect(out.actions.every((v) => v >= -1 && v <= 1)).toBe(true);
    expect(out.debug).toEqual({ confidence: 1, explored: 0 }); // confidence recortada a 0..1
  });

  it('la última respuesta del brain no se fuga: solo actions + debug', () => {
    const fake = new FakeBrain();
    fake.next = { action: 0.5, actionName: 'comer', confidence: 0.9, explored: true };
    const adapter = new BrainV05Adapter(fake);
    const out = adapter.think(inputs({}));
    expect(Object.keys(out).sort()).toEqual(['actions', 'debug']);
    expect('actionName' in out).toBe(false);
  });
});
