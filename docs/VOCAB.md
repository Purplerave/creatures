# Palabras y vocabulario (Fase vocab)

Documento de desarrollo del módulo de **palabras** de Creatures: aprendizaje
por asociación palabra → estímulo, con **olvido por el paso del tiempo**.
Referencia de lógica: `bichito.html` (`teachAssociation`: repetición ⇒
confianza; 3 repeticiones = aprendida), **más** el decaimiento temporal que
añade este módulo.

> **Alcance:** este módulo no toca `src/brain/` ni `src/biochem/`. El mapeo
> a los futuros `BrainInputs` está **propuesto, no cableado** (ver
> [Mapeo al cerebro](#mapeo-al-cerebro-propuesta)).

## Qué hay dónde

```
src/
├── contracts/ivocab.ts    # CONTRATO: VocabEntry, IVocab, VocabConfig, VocabStats
└── vocab/
    ├── vocabulary.ts      # clase Vocabulary implements IVocab
    └── index.ts           # API pública
tests/                     # vocab-learn / -forgetting / -serialize / -limits
```

Uso:

```ts
import { Vocabulary } from './vocab';

const vocab = new Vocabulary();           // config por defecto
vocab.teach('comida', 'objeto:manzana');  // refuerzo 1 → 0.34
vocab.teach('comida', 'objeto:manzana');  // refuerzo 2 → 0.68
vocab.teach('comida', 'objeto:manzana');  // refuerzo 3 → 1.0 ⇒ «aprendida»
vocab.tick(1);                            // −0.05 ⇒ 0.95, ya NO aprendida
vocab.recall('objeto:manzana');           // entradas de ese estímulo
vocab.getStats();                         // { words, learned, total }
const json = vocab.serialize();           // guardado/carga completos
```

## Aprendizaje: fórmula exacta

Clave de una entrada: **palabra normalizada × estímulo**. La palabra se
normaliza con `trim` + colapsar espacios + `toLowerCase()` (sin locale: nada
de `toLocaleLowerCase`, para que el resultado no dependa de la tabla ICU de
cada sistema). «  Pelota  » y «pelota» son la misma entrada; la misma
palabra con **otro** `stimulusId` es otra entrada con contadores
independientes.

Cada `teach(word, stimulusId)`:

```
confianza = clamp(confianza + boostPerReinforcement, 0, 1)   // boost = 0.34
reps      = reps + 1
lastReinforcedAt = now                                       // reloj de simulación
learned   = confianza >= learnThreshold                      // umbral = 1.0
```

Con la config por defecto: 1 refuerzo = **0.34**, 2 = **0.68**, 3 = 1.02 →
recortado a **1.0** ⇒ «aprendida». Más refuerzos no suben de 1 (el contador
`reps` sigue creciendo). Es decir, **3 repeticiones = aprendida**, igual que
`bichito.html`, pero expresado con confianza normalizada 0..1 en vez de
porcentaje 0..100.

## Olvido: fórmula exacta

Elegimos **decaimiento lineal simple** (documentado aquí como decisión):
cada tick resta una cantidad constante por segundo, independientemente de la
confianza actual.

```
now = now + dt                                      // solo tick() mueve el reloj
por cada entrada con lastReinforcedAt < now:
    confianza = max(0, confianza − decayPerSecond · dt)   // decay = 0.05/s
    learned   = confianza >= learnThreshold               // SE RECALCULA
```

Propiedades:

- **Determinista**: sin `Math.random()`, sin tiempo real. Mismas llamadas +
  mismos `dt` ⇒ mismo estado byte a byte (test `vocab-forgetting`).
- **Acumulativo**: `tick(1)` diez veces = `tick(10)` una vez. Con la config
  por defecto una palabra en 1.0 tarda **20 s** de simulación en llegar a 0
  (nunca pasa de ella).
- **`learned` puede CAER**: al ser `learnThreshold = 1.0` (el máximo), el
  **primer tick** ya deja a una palabra «aprendida» por debajo del umbral:
  con `decayPerSecond = 0.05`, `tick(1)` ⇒ 0.95 ⇒ `learned = false`. Sigue
  siendo la entrada más fuerte del vocabulario (recuerda 0.95 de su
  significado), pero ya no está «aprendida»; un `teach` posterior la
  recupera (0.95 + 0.34 ⇒ 1.0). Este es el test clave del módulo.
- El refuerzo reinicia la cuenta: `lastReinforcedAt` se fija en `now`, así
  que solo decae el tiempo transcurrido **desde el último** `teach` (la
  resta por tick ya equivale exactamente a `decay · (now −
  lastReinforcedAt)` porque el reloj solo avanza en `tick`).

> Si se prefiere que «aprendida» aguante varios segundos sin refuerzo,
> baje `decayPerSecond` (p. ej. 0.01 ⇒ cae del umbral en el segundo 100) o
> suba `boostPerReinforcement` y baje `learnThreshold` a 0.9 — solo es tocar
> la config, la fórmula no cambia.

## Config por defecto

`DEFAULT_VOCAB_CONFIG` (en `src/contracts/ivocab.ts`):

| Campo | Valor | Significado |
|---|---|---|
| `decayPerSecond` | `0.05` | Olvido lineal: −0.05 de confianza por segundo simulado. |
| `learnThreshold` | `1.0` | Umbral de «aprendida» (= 3 refuerzos con el boost por defecto). |
| `boostPerReinforcement` | `0.34` | Confianza ganada por cada `teach` (3·0.34 = 1.02 → 1.0). |
| `maxEntries` | `100` | Aforo máximo de entradas (palabra × estímulo). |

Config inválida (umbrales fuera de rango, aforo no entero, decay negativo)
⇒ `RangeError` en el constructor (`validateVocabConfig`).

```ts
const vocab = new Vocabulary({ decayPerSecond: 0.01, maxEntries: 50 });
```

### Aforo y expulsión (eviction)

Al hacer un `teach` que crearía la entrada `maxEntries + 1`, se expulsa
**la más débil** antes de insertar:

1. menor `confianza`;
2. empate ⇒ menor `reps`;
3. empate ⇒ `lastReinforcedAt` más antiguo;
4. empate ⇒ la que se insertó antes (orden estable).

La palabra que se acaba de enseñar **nunca** se expulsa: se inserta siempre
(en el peor caso, expulsa a otra). Refuerzar una entrada existente no
consume aforo (misma clave).

## Cómo añadir estímulos

No hay registro previo: **el estímulo es una cadena libre** que decide quien
llama a `teach()`. Convención usada en los tests: ids de tipo
`objeto:manzana`, `color`, `juego`… Cualquier módulo (o el pad de diálogo
futuro) puede enseñar con el id que ya use para nombrar el estímulo; si dos
componentes usan el mismo id, comparten entradas (por diseño: es la misma
señal). Si el equipo acuerda un vocabulario canónico de ids, se documenta
aquí y en el contrato.

## Serialización

`serialize()` produce JSON estable (mismo estado ⇒ misma cadena byte a byte):

```json
{
  "schemaVersion": 1,
  "config": { "decayPerSecond": 0.05, "learnThreshold": 1, "boostPerReinforcement": 0.34, "maxEntries": 100 },
  "now": 12.5,
  "entries": [ { "word": "comida", "stimulusId": "objeto:manzana", "confidence": 1, "reps": 3, "lastReinforcedAt": 10, "learned": true } ]
}
```

`deserialize()` sanea todo (versión de esquema, reloj, cada campo de cada
entrada, duplicados, aforo) y **no deja el estado a medias**: si algo falla
lanza `RangeError` y la instancia queda como estaba (test `vocab-serialize`).

## Mapeo al cerebro (propuesta)

**No cableado a propósito.** El contrato documenta la idea en
`src/contracts/ivocab.ts` (bloque `MAPEO PROPUESTO`) y debe acordarse en el
pad antes de tocar `src/brain/`:

```
input(palabra) = entrada(word, stimulusId).learned
                 ? entrada.confidence      // 0..1, ya aprendida
                 : 0                       // no aprendida ⇒ no anticipa nada
```

- La palabra solo mueve al cerebro si su asociación está **aprendida**; la
  fuerza del input es su confianza (recuerda cuánto, no solo sí/no).
- Palabra con varias entradas (varios estímulos): se propone usar **solo la
  de mayor confianza** (desempate: `stimulusId` alfabético) para que el
  input sea determinista — alternativa a discutir: disparar todas sus
  entradas aprendidas.
- Relación con los estímulos de `bichito.html`: allí una palabra aprendida
  sube `state.stimuli[target]` a 55 al decirla; aquí ese 55/100 ≈ la
  confianza de la entrada (0.55…), así que el análogo natural es
  `fuerza = confidence` en vez de un valor fijo.

## Tests

| Fichero | Cubre |
|---|---|
| `vocab-learn.test.ts` | 1 teach → 0.34 · 3 teaches → 1.0 + `learned` · palabra igual/estímulo distinto = entradas aparte · normalización · errores de args. |
| `vocab-forgetting.test.ts` | `learned` cae con los ticks · decaimiento lineal hasta 0 · recuperación con un teach · reinicio del reloj al refuerzar · determinismo · `dt` inválidos. |
| `vocab-serialize.test.ts` | roundtrip idéntico (entradas, confianzas, stats, config, reloj) · mismo comportamiento tras cargar · saneado de JSON roto. |
| `vocab-limits.test.ts` | evict de la más débil con aforo lleno · desempates (reps/antigüedad) · refuerzo no consume aforo · `maxEntries = 1` · config inválida. |
