# Genoma y mutación (Fase genoma)

Documento de desarrollo del módulo de **genoma/mutación** de Creatures:
estructura genotípica serializable que configura el fenotipo — parámetros que
ajustan el `decayPerSecond` de los drives y la configuración del cerebro.

> **Capa de configuración:** el genoma **no modifica** `driveTable.ts` ni el
> cerebro. Solo cambia los valores con los que se construyen (deltas sobre
> `decayPerSecond` y knobs del cerebro). Sin phenotype, el comportamiento es
> idéntico al de Fase 0 — cubierto por test.

## Qué hay dónde

```
src/
├── contracts/igenome.ts   # CONTRATO: GenomeConfig, IGenome, PhenotypeConfig
└── genome/
    ├── genes.ts           # tabla extensible de genes (registerGene + 9 semilla)
    ├── prng.ts            # mulberry32 determinista (semilla uint32)
    ├── phenotype.ts       # fórmula genes → efectos
    ├── genome.ts          # clase Genome implements IGenome
    └── index.ts           # API pública
tests/                     # genome-determinism / -mutation / -extensibility / -phenotype
```

## Genes: qué son

Un **gen** es un número normalizado **0..1** que representa una faceta de la
criatura (su "temperamento"). El conjunto de genes es el **genotipo**; los
efectos resueltos que produce (deltas de decay + knobs del cerebro) son el
**fenotipo**. Los genes no hacen nada por sí solos: `getPhenotype()` los
traduce y quien construye el motor/cerebro aplica la configuración.

### Genes semilla (9)

| id | etiqueta | afecta | efecto máx. (gen = 1) |
|---|---|---|---|
| `metabolismo` | Metabolismo | hambre, energía | decay hambre ×1.4, consumo de energía ×1.4 |
| `templanza` | Templanza | miedo | disipa el miedo ×1.5 |
| `sociabilidad` | Sociabilidad | vínculo | el vínculo decae a la mitad sin refuerzo |
| `alerta` | Alerta | curiosidad, aburrimiento | curiosidad decae ×0.6, aburrimiento ×0.7 |
| `calma` | Calma | confort, sueño | confort decae ×0.6, sueño acumula ×1.3 |
| `resiliencia` | Resiliencia | miedo, confort | miedo ×1.4, confort ×0.7 |
| `capacidad` | Capacidad | cerebro: `hiddenSize` | 4 → 64 (entero) |
| `exploracion` | Exploración | cerebro: `epsilonInitial` | 0.05 → 0.6 |
| `aprendizaje` | Aprendizaje | cerebro: `learningRate` | 0.01 → 0.3 |

Todos arrancan en `defaultWeight: 0.5` (neutro para los efectos de drive).

## Fórmula del fenotipo

### 1) Drives — delta relativo de `decayPerSecond`

```
delta(d)  = Σ_genes g que afectan a d   (2·valor_g − 1) · peso(g→d)
decay_eff = decayPerSecond(d) · clamp(1 + delta(d), 0, 4)
```

- `valor_g ∈ [0,1]` con **neutral en 0.5** ⇒ delta 0 en el valor por defecto.
- gen a 1 ⇒ aporta `+peso`; gen a 0 ⇒ `−peso` (peso firmado en el registro).
- Ejemplo: `metabolismo 0.8` ⇒ delta hambre = (2·0.8 − 1)·0.4 = **+0.16** ⇒
  decay efectivo = 0.03 · 1.16 = 0.0348/s.
- El clamp `[0, 4]` acota el multiplicador: nunca invierte el signo base ni
  amplifica más de 4×.

Varios genes pueden afectar al mismo drive (p. ej. `templanza` y
`resiliencia` sobre `miedo`): sus deltas **se suman**.

### 2) Cerebro — interpolación lineal

```
knob = min + valor_g · (max − min)        (hiddenSize: redondeado a entero ≥ 1)
```

`PhenotypeConfig.brain` solo lleva los knobs presentes. Quien construya el
cerebro los aplica como constructor options; el motor de bioquímica los
ignora por completo.

## Mutar y reproducir

```ts
import { Genome } from './src/genome';

const parent = new Genome({ seed: 12345 });        // seed creadora (uint32)
const child  = parent.clone();
child.mutate(42, 0.5);                             // semilla 42, intensidad 0.5

const json = child.serialize();                    // JSON estable (claves ordenadas)
const back = new Genome();
back.deserialize(json);                            // valida + carga + devuelve config
back.serialize() === json;                         // ⇒ true (roundtrip)
```

- **Determinismo total:** mulberry32, nada de `Math.random()`. Mismo genoma +
  misma semilla + misma intensity ⇒ hijo **idéntico byte a byte**.
- **Orden de consumo del PRNG:** ids de gen ordenados alfabéticamente.
- **Mutación:** por gen, `delta = signedDelta(rng) · 0.25 · intensity`,
  recortado al rango del gen (0..1). `intensity` se recorta a `[0,1]`;
  `0` ⇒ sin cambios; `>0` ⇒ se mueve al menos un gen.
- `mutate()` **no** cambia la seed creadora (identifica la estirpe, no la
  última mutación).

## Cómo añadir un gen

Añadir un gen = **una fila**, sin tocar `genome.ts`, `phenotype.ts` ni el
motor (mismo criterio que `registerDrive`):

```ts
import { registerGene } from './src/genome';

registerGene({
  id: 'agresividad',
  label: 'Agresividad',
  description: 'Tendencia a disparar el miedo ajeno…',
  defaultWeight: 0.5,          // neutro
  range: [0, 1],               // saneado del valor
  drives: [{ driveId: 'miedo', weight: 0.3 }],   // y/o:
  brain:   { knob: 'learningRate', range: [0.01, 0.3] },
});
```

Reglas del registro:
- id único (duplicado ⇒ `Error`), sin espacios; `range` dentro de 0..1;
  `defaultWeight` dentro del `range` (inválido ⇒ `RangeError`).
- Registrar **antes** de construir el `Genome` (si no, `getGene()` devuelve
  el default pero no se serializa hasta la próxima construcción).
- `driveId` debe existir en `driveTable` — el motor valida el phenotype en
  construcción y lanza `RangeError` si el drive no está registrado.

## Cómo se aplica al motor

```ts
const genome  = new Genome(config);
const engine  = new BiochemEngine({ phenotype: genome.getPhenotype() });
```

`BiochemEngine` acepta `phenotype?` en sus opciones (único cambio de Fase
genoma en `src/biochem/engine.ts`, puramente aditivo): en construcción copia
cada `DriveDef` afectado con `decayPerSecond` ajustado. `driveTable.ts`
queda intacta. Omitir `phenotype` (o deltas a 0) ⇒ bit a bit Fase 0.

## Tests

`npm test` — 25 de Fase 0 + 4 ficheros nuevos:

| fichero | cubre |
|---|---|
| `genome-determinism.test.ts` | mismo padre/semilla/intensity ⇒ hijo idéntico; roundtrip serialize |
| `genome-mutation.test.ts` | intensity 0 ⇒ nada; >0 ⇒ cambia; clamp 0..1; semillas distintas ⇒ hijos distintos |
| `genome-extensibility.test.ts` | `registerGene` nuevo ⇒ `getGene` + phenotype + motor, sin tocar el motor |
| `genome-phenotype.test.ts` | decay en la dirección esperada; sin phenotype ⇒ idéntico al base |
