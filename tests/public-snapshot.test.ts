/**
 * Tests de S1: contrato público y `toPublicSnapshot()` determinista.
 * Cubre: determinismo, top-3 por déficit, fronteras de adjetivos, prioridad
 * del titular, cap del diario, tabla de mood y umbrales de etapa.
 */
import { describe, expect, it } from 'vitest';
import type { DriveId, DriveState } from '../src/contracts/types';
import type { PublicDiaryEntry, PublicSnapshot } from '../src/contracts/ipublic';
import { Vocabulary } from '../src/vocab';
import {
  MOOD_RULES,
  PUBLIC_DIARY_CAP,
  PUBLIC_DRIVES,
  PUBLIC_HEADLINE_NONE,
  PUBLIC_NEED_COUNT,
  collectLearnedToday,
  derivePublicHeadline,
  derivePublicMood,
  derivePublicNeeds,
  formatSimClock,
  needAdjective,
  publicDayFromSimTime,
  publicStageFromSimTime,
  toPublicSnapshot,
} from '../src/public/snapshot';

/** Estado de los 8 drives con nivel neutro 0.5, sobreescrito por `overrides`. */
function makeDrives(overrides: Partial<Record<DriveId, number>> = {}): Record<DriveId, DriveState> {
  const base: Record<DriveId, number> = {
    hambre: 0.5,
    energia: 0.5,
    sueno: 0.5,
    curiosidad: 0.5,
    vinculo: 0.5,
    aburrimiento: 0.5,
    miedo: 0.5,
    confort: 0.5,
  };
  const merged: Record<DriveId, number> = { ...base };
  for (const [id, value] of Object.entries(overrides)) {
    if (typeof value === 'number') merged[id] = value;
  }
  const drives = {} as Record<DriveId, DriveState>;
  for (const [id, value] of Object.entries(merged)) {
    drives[id] = { level: value, target: value };
  }
  return drives;
}

function diaryEntry(kind: PublicDiaryEntry['kind'], text: string, t = 'D1 00:00'): PublicDiaryEntry {
  return { t, text, kind };
}

function baseInput(overrides: Partial<Parameters<typeof toPublicSnapshot>[0]> = {}) {
  return {
    drives: makeDrives(),
    simTime: 0,
    tick: 1,
    diary: [],
    learnedToday: [],
    action: null,
    ...overrides,
  };
}

describe('PublicSnapshot — determinismo', () => {
  it('la misma entrada produce exactamente el mismo JSON', () => {
    const input = baseInput({
      simTime: 123.4,
      tick: 4242,
      diary: [
        diaryEntry('care', 'Le dieron de comer', 'D3 02:03'),
        diaryEntry('learn', 'Aprendió «pelota»', 'D3 02:04'),
      ],
      learnedToday: ['pelota', 'comida'],
      action: { name: 'Comer', guided: true },
    });
    const a = toPublicSnapshot(input);
    const b = toPublicSnapshot(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(b);
  });

  it('no muta la entrada (el diario sigue intacto)', () => {
    const diary = [diaryEntry('world', 'Llovizna en la ventana')];
    const snapshot = toPublicSnapshot(baseInput({ diary }));
    expect(diary).toHaveLength(1);
    expect(snapshot.diary).not.toBe(diary);
    snapshot.diary.push(diaryEntry('learn', 'trampa'));
    expect(diary).toHaveLength(1);
  });

  it('tiene exactamente la forma del contrato §3', () => {
    const snapshot: PublicSnapshot = toPublicSnapshot(baseInput());
    expect(Object.keys(snapshot).sort()).toEqual(
      ['action', 'day', 'diary', 'headline', 'headlineKind', 'learnedToday', 'mood', 'needs', 'stage', 'tick'].sort(),
    );
    expect(snapshot.needs.length).toBeLessThanOrEqual(PUBLIC_NEED_COUNT);
    expect(snapshot.diary).toHaveLength(0);
    expect(snapshot.mood).toBe('tranquilo');
    expect(snapshot.stage).toBe('huevo');
    expect(snapshot.day).toBe(1);
    expect(snapshot.headline).toBe(PUBLIC_HEADLINE_NONE);
    expect(snapshot.headlineKind).toBe('none');
  });
});

describe('PublicSnapshot — necesidades (top-3 por déficit)', () => {
  it('ordena por déficit descendente y solo devuelve 3', () => {
    const needs = derivePublicNeeds(
      makeDrives({
        hambre: 0.95,
        sueno: 0.9,
        miedo: 0.85,
        aburrimiento: 0.8,
        energia: 0.05,
        confort: 0.1,
        curiosidad: 0.4,
        vinculo: 0.3,
      }),
    );
    expect(needs).toHaveLength(3);
    // déficits: hambre .95 · energia .95 · sueno .9 · confort .9 ⇒ empates por
    // orden de registro (hambre antes que energia; sueno antes que confort).
    expect(needs.map((need) => need.id)).toEqual(['hambre', 'energia', 'sueno']);
    expect(needs.map((need) => need.adjective)).toEqual(['urgente', 'urgente', 'urgente']);
  });

  it('usa la dirección correcta: «más alto es peor» resta, «más alto es mejor» invertido', () => {
    // Nivel alto de hambre = mal (déficit alto). Nivel alto de confort = bien (déficit bajo).
    const needs = derivePublicNeeds(
      makeDrives({ hambre: 0.9, confort: 0.9, energia: 0.9, sueno: 0.1, miedo: 0.1, aburrimiento: 0.1, curiosidad: 0.1, vinculo: 0.1 }),
    );
    const byId = new Map(needs.map((need) => [need.id, need.adjective]));
    // déficits: hambre .9, energia .1, sueno .1, curiosidad .9, vinculo .9, aburrimiento .1, miedo .1, confort .1
    expect(needs.map((need) => need.id)).toEqual(['hambre', 'curiosidad', 'vinculo']);
    expect(byId.get('hambre')).toBe('urgente');
    // confort NO aparece: su nivel es alto y eso es bueno (déficit 0.1 ⇒ lleno).
    expect(needAdjective(0.1)).toBe('lleno');
  });

  it('los empates se resuelven por orden de registro (hambre, energia, sueno…)', () => {
    const needs = derivePublicNeeds(makeDrives());
    expect(needs.map((need) => need.id)).toEqual(['hambre', 'energia', 'sueno']);
  });

  it('etiquetas legibles en español para los 8 drives', () => {
    const labels = Object.values(PUBLIC_DRIVES).map((def) => def.label);
    expect(labels).toEqual(['Comer', 'Descansar', 'Dormir', 'Explorar', 'Acurrucarse', 'Jugar', 'Sentirse seguro', 'Relajarse']);
    for (const label of labels) expect(label).toMatch(/^[\p{Lu}\p{Ll}áéíóúñü ]+$/u);
  });
});

describe('PublicSnapshot — fronteras de adjetivos (por déficit)', () => {
  it('urgente ≥ 0.75 · bajo ≥ 0.5 · normal ≥ 0.25 · lleno < 0.25', () => {
    expect(needAdjective(0.75)).toBe('urgente');
    expect(needAdjective(0.749999)).toBe('bajo');
    expect(needAdjective(0.5)).toBe('bajo');
    expect(needAdjective(0.499999)).toBe('normal');
    expect(needAdjective(0.25)).toBe('normal');
    expect(needAdjective(0.249999)).toBe('lleno');
    expect(needAdjective(0)).toBe('lleno');
    expect(needAdjective(1)).toBe('urgente');
    // fuera de rango ⇒ recortado, nunca lanza
    expect(needAdjective(-3)).toBe('lleno');
    expect(needAdjective(12)).toBe('urgente');
  });

  it('la frontera se ve también a través de los drives reales', () => {
    // hambre 0.75 ⇒ déficit 0.75 ⇒ urgente; hambre 0.74 ⇒ bajo.
    const urgent = derivePublicNeeds(makeDrives({ hambre: 0.75 })).find((n) => n.id === 'hambre');
    const lower = derivePublicNeeds(makeDrives({ hambre: 0.74 })).find((n) => n.id === 'hambre');
    expect(urgent?.adjective).toBe('urgente');
    expect(lower?.adjective).toBe('bajo');
  });
});

describe('PublicSnapshot — prioridad del titular', () => {
  const urgentNeeds = derivePublicNeeds(
    makeDrives({ hambre: 0.99, miedo: 0.95, aburrimiento: 0.9 }),
  );

  it('learn gana a todo lo demás', () => {
    const diary = [
      diaryEntry('world', 'Un pájaro en la ventana'),
      diaryEntry('growth', 'Nilo ha crecido: cría'),
      diaryEntry('learn', 'Aprendió «nido»'),
      diaryEntry('care', 'Le dieron de comer'),
    ];
    const result = derivePublicHeadline(diary, urgentNeeds);
    expect(result).toEqual({ headline: 'Aprendió «nido»', headlineKind: 'learn' });
  });

  it('growth gana a necesidad urgente y a eventos', () => {
    const diary = [diaryEntry('world', 'Llovizna'), diaryEntry('growth', 'Nilo ha crecido: joven')];
    const result = derivePublicHeadline(diary, urgentNeeds);
    expect(result).toEqual({ headline: 'Nilo ha crecido: joven', headlineKind: 'growth' });
  });

  it('la necesidad urgente gana al evento', () => {
    const diary = [diaryEntry('world', 'Un pájaro en la ventana')];
    const result = derivePublicHeadline(diary, urgentNeeds);
    expect(result.headlineKind).toBe('need');
    expect(result.headline).toBe('Nilo necesita comer');
  });

  it('el evento gana a «none» y se elige el más reciente (world o care)', () => {
    const diary = [diaryEntry('care', 'Se acurrucó'), diaryEntry('world', 'Cayó una hoja')];
    const result = derivePublicHeadline(diary, derivePublicNeeds(makeDrives()));
    expect(result).toEqual({ headline: 'Cayó una hoja', headlineKind: 'event' });
  });

  it('sin nada que contar ⇒ none con titular de reserva', () => {
    const result = derivePublicHeadline([], derivePublicNeeds(makeDrives({ hambre: 0.4, confort: 0.7 })));
    expect(result).toEqual({ headline: PUBLIC_HEADLINE_NONE, headlineKind: 'none' });
  });
});

describe('PublicSnapshot — diario (cap 8)', () => {
  it('devuelve solo las últimas 8 entradas, en el mismo orden cronológico', () => {
    const diary = Array.from({ length: 12 }, (_, i) => diaryEntry('world', `evento ${i}`, `D1 00:${String(i).padStart(2, '0')}`));
    const snapshot = toPublicSnapshot(baseInput({ diary }));
    expect(snapshot.diary).toHaveLength(PUBLIC_DIARY_CAP);
    expect(snapshot.diary.map((entry) => entry.text)).toEqual(
      Array.from({ length: 8 }, (_, i) => `evento ${i + 4}`),
    );
  });

  it('el reloj del diario es determinista y legible (D<día> <mm>:<ss>)', () => {
    expect(formatSimClock(0, 1)).toBe('D1 00:00');
    expect(formatSimClock(61, 2)).toBe('D2 01:01');
    expect(formatSimClock(3599, 60)).toBe('D60 59:59');
    expect(formatSimClock(3600, 61)).toBe('D61 60:00');
  });
});

describe('PublicSnapshot — mood (tabla documentada)', () => {
  it('cubre exactamente los 7 casos de la tabla (6 reglas + resto)', () => {
    expect(MOOD_RULES.map((rule) => rule.mood)).toEqual([
      'durmiendo',
      'enojado',
      'inquieto',
      'hambriento',
      'contento',
      'cansado',
      'tranquilo',
    ]);
  });

  it('durmiendo exige energía < 0.1 Y sueño > 0.8 (ambas fronteras)', () => {
    expect(derivePublicMood(makeDrives({ energia: 0.09, sueno: 0.81 }))).toBe('durmiendo');
    expect(derivePublicMood(makeDrives({ energia: 0.1, sueno: 0.81 }))).not.toBe('durmiendo');
    expect(derivePublicMood(makeDrives({ energia: 0.09, sueno: 0.8 }))).not.toBe('durmiendo');
  });

  it('enojado (miedo > 0.8) tiene prioridad sobre inquieto (miedo > 0.6)', () => {
    expect(derivePublicMood(makeDrives({ miedo: 0.81 }))).toBe('enojado');
    expect(derivePublicMood(makeDrives({ miedo: 0.8 }))).toBe('inquieto');
    expect(derivePublicMood(makeDrives({ miedo: 0.61 }))).toBe('inquieto');
    expect(derivePublicMood(makeDrives({ aburrimiento: 0.71 }))).toBe('inquieto');
    expect(derivePublicMood(makeDrives({ aburrimiento: 0.7 }))).toBe('tranquilo');
  });

  it('hambriento, contento y cansado con sus fronteras exactas', () => {
    expect(derivePublicMood(makeDrives({ hambre: 0.71 }))).toBe('hambriento');
    expect(derivePublicMood(makeDrives({ hambre: 0.7 }))).toBe('tranquilo');
    expect(derivePublicMood(makeDrives({ confort: 0.71, hambre: 0.29 }))).toBe('contento');
    expect(derivePublicMood(makeDrives({ confort: 0.7, hambre: 0.29 }))).not.toBe('contento');
    expect(derivePublicMood(makeDrives({ confort: 0.71, hambre: 0.3 }))).not.toBe('contento');
    expect(derivePublicMood(makeDrives({ energia: 0.29 }))).toBe('cansado');
    expect(derivePublicMood(makeDrives({ energia: 0.3 }))).toBe('tranquilo');
  });

  it('los extremos completos de la tabla: sueño profundo vs. apacible', () => {
    expect(derivePublicMood(makeDrives({ energia: 0, sueno: 1, miedo: 1, hambre: 1 }))).toBe('durmiendo');
    expect(
      derivePublicMood(makeDrives({ energia: 1, sueno: 0, miedo: 0, hambre: 0, aburrimiento: 0, confort: 1 })),
    ).toBe('contento');
    expect(
      derivePublicMood(makeDrives({ energia: 1, sueno: 0, miedo: 0, hambre: 0.5, aburrimiento: 0, confort: 1 })),
    ).toBe('tranquilo');
  });
});

describe('PublicSnapshot — día y etapa (umbrales documentados)', () => {
  it('día = 60 s simulados, 1-based', () => {
    expect(publicDayFromSimTime(0)).toBe(1);
    expect(publicDayFromSimTime(59.999)).toBe(1);
    expect(publicDayFromSimTime(60)).toBe(2);
    expect(publicDayFromSimTime(600)).toBe(11);
  });

  it('etapas: huevo < 20 s · cría < 90 s · joven < 240 s · adulto ≥ 240 s', () => {
    expect(publicStageFromSimTime(0)).toBe('huevo');
    expect(publicStageFromSimTime(19.99)).toBe('huevo');
    expect(publicStageFromSimTime(20)).toBe('cria');
    expect(publicStageFromSimTime(89.99)).toBe('cria');
    expect(publicStageFromSimTime(90)).toBe('joven');
    expect(publicStageFromSimTime(239.99)).toBe('joven');
    expect(publicStageFromSimTime(240)).toBe('adulto');
    expect(publicStageFromSimTime(100000)).toBe('adulto');
  });

  it('tiempos inválidos ⇒ día 1 / huevo (nunca lanza)', () => {
    expect(publicDayFromSimTime(-5)).toBe(1);
    expect(publicStageFromSimTime(Number.NaN)).toBe('huevo');
    expect(toPublicSnapshot(baseInput({ simTime: Number.NaN })).tick).toBe(1);
  });
});

describe('PublicSnapshot — learnedToday (del vocabulario)', () => {
  it('lista solo las palabras aprendidas desde el inicio del día, orden alfabéticamente', () => {
    const vocabulary = new Vocabulary();
    for (let i = 0; i < 3; i += 1) vocabulary.teach('pelota', 'objeto:pelota');
    for (let i = 0; i < 3; i += 1) vocabulary.teach('comida', 'comida');
    vocabulary.teach('migaja', 'comida'); // solo 1 refuerzo ⇒ aún no aprendida
    vocabulary.tick(0);

    expect(collectLearnedToday(vocabulary, 0)).toEqual(['comida', 'pelota']);
    // Una ventana de día posterior a la última enseñanza ⇒ nada.
    expect(collectLearnedToday(vocabulary, 1000)).toEqual([]);
  });

  it('el snapshot incluye learnedToday sin tocarlo', () => {
    const snapshot = toPublicSnapshot(baseInput({ learnedToday: ['nido', 'comida'] }));
    expect(snapshot.learnedToday).toEqual(['nido', 'comida']);
    snapshot.learnedToday.push('otra');
    expect(toPublicSnapshot(baseInput({ learnedToday: ['nido', 'comida'] })).learnedToday).toEqual([
      'nido',
      'comida',
    ]);
  });
});

describe('PublicSnapshot — acción pública', () => {
  it('pasa la acción con su bandera guided y la normaliza', () => {
    expect(toPublicSnapshot(baseInput({ action: { name: 'Comer', guided: true } })).action).toEqual({
      name: 'Comer',
      guided: true,
    });
    expect(toPublicSnapshot(baseInput()).action).toBeNull();
  });

  it('tick siempre es entero ≥ 0', () => {
    expect(toPublicSnapshot(baseInput({ tick: 7.9 })).tick).toBe(7);
    expect(toPublicSnapshot(baseInput({ tick: -4 })).tick).toBe(0);
    expect(toPublicSnapshot(baseInput({ tick: Number.NaN })).tick).toBe(0);
  });
});
