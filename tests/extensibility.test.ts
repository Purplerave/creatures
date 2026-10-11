/**
 * Extensibilidad: añadir un drive = una entrada en el registro.
 * El motor lo recoge sin tocar engine.ts ni ningún otro módulo.
 */
import { describe, expect, it } from 'vitest';
import { BiochemEngine } from '../src/biochem/engine';
import { listDriveDefs, registerDrive, getDriveDef } from '../src/biochem/driveTable';

describe('tabla extensible de drives', () => {
  it('el registro arranca con los 8 drives de Fase 0', () => {
    const ids = listDriveDefs().map((d) => d.id);
    for (const id of ['hambre', 'energia', 'sueno', 'curiosidad', 'vinculo', 'aburrimiento', 'miedo', 'confort']) {
      expect(ids).toContain(id);
    }
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });

  it('un drive nuevo registrado se recoge en el motor sin tocar el motor', () => {
    const id = 'prueba-extensible';
    if (!listDriveDefs().some((d) => d.id === id)) {
      registerDrive({
        id,
        label: 'Drive de prueba',
        decayPerSecond: 0.1,
        clamp: [0, 1],
        influences: [{ chemical: 'dopamina', gain: 3 }],
      });
    }
    expect(getDriveDef(id).label).toBe('Drive de prueba');

    // Motor construido DESPUÉS del registro: el incluye.
    const engine = new BiochemEngine({ initialChemicals: { dopamina: 1 } });
    expect(engine.listDrives()).toContain(id);
    expect(engine.getDrive(id).level).toBe(0);

    // Y reacciona a su acoplamiento.
    engine.tick(0.1);
    expect(engine.getDrive(id).level).toBeGreaterThan(0);
  });

  it('rechaza ids duplicados', () => {
    expect(() =>
      registerDrive({ id: 'hambre', label: 'x', decayPerSecond: 0, clamp: [0, 1], influences: [] }),
    ).toThrow(/duplicado/i);
  });
});
