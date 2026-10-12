# ADAPTER — D1: Adaptador del cerebro v0.5 (`BrainV05Adapter`)

Estado: **D1 implementado y con el cerebro real conectado** y **D2: puerto de depuración `getDebugState()`** añadido como excepción documentada (los tests de interfaz fijan esa superficie ampliada). El resto del adaptador está intacto: lo que
cambia en la fábrica del runtime es que ahora instancia `BrainV05`
(`src/brain/brain-v05.ts`) en lugar del `PlaceholderBrain` temporal. El modelo,
sus fórmulas y su espacio de acciones se documentan en
[`CEREBRO.md`](CEREBRO.md); el placeholder se conserva en el repo para tests.

## Regla del cerebro encapsulado y desechable

El adaptador es la única pieza que ofrece decisiones al resto del runtime a
través de `IBrain`: expone `think()`, `reinforce()` y — como excepción D2
autorizada — `getDebugState()`, sin getters que filtren pesos o capas. La
raíz de composición (`main.ts`) construye `BrainV05` en su fábrica y además
lee `getDebugState()` del modelo para su panel de diagnóstico propio; ese
acceso no forma parte de `IBrain`. Cambiar de cerebro sigue concentrado en la
fábrica del runtime (una línea), sin tocar al resto del proyecto.

> **Excepción D2 autorizada:** `getDebugState()` es un **puerto de
> depuración explícito** (método, no getter) pedido por la CEO para la vista
> de depuración L2. Contradice la regla de «no exponer internals», así que
> queda constancia de que es una excepción deliberada y **acotada** al
> contrato `BrainDebugState` documentado abajo; no autoriza a exponer ε ni la
> arquitectura del MLP, y añadir campos exige nueva autorización.

## Diagrama de flujo

```
BiochemEngine ──▶ BrainInputs (contracts/ibrain.ts)
                 { drives: Record<DriveId, DriveState>,
                   chemicals: Record<ChemicalId, number>,
                   tick: number }
                        │
                        ▼
              BrainV05Adapter.think()          ← src/brain/adapter.ts
   ┌─────────────────────────────────────────────────────┐
   │ drives   : number[8]  niveles 0..1, orden fijo      │
   │ stimuli  : number[3]  provider mapStimuli (opcional)│
   │ genome   : number[4]  provider mapGenome  (opcional)│
   └─────────────────────────────────────────────────────┘
                        │  BrainV05Input (brainv05-types.ts)
                        ▼
              brain.think(vector)   ← BrainV05 (MLP real; placeholder en tests)
                        │  { action, actionName, confidence, explored }
                        ▼
   BrainOutput { actions: [clamp(action,-1,1)],            ← contrato IBrain
                 debug: { confidence 0..1, explored 0|1 } }
                        │
                        ▼
        consumidor (main.ts, futuros módulos…)
                        │
   BrainV05Adapter.reinforce(reward ∈ [-1,1])
        → brain.reinforce(última acción de think, reward recortado)
        → sin think() previo: no-op (no lanza)
                        │
   BrainV05Adapter.getDebugState()   ← puerto D2 (excepción autorizada)
        → BrainDebugState para la vista L2 (ver sección Debug)
```

## Mapeos provisionales (⚠️ confirmar con Tecnotron/CEO en el pad)

| Entrada | Mapeo actual | Motivo / alternativa |
|---|---|---|
| `drives` | Orden fijo `DRIVE_ORDER` = `[hambre, energia, sueno, curiosidad, vinculo, aburrimiento, miedo, confort]` (espejo del registro de `driveTable.ts`), `level` recortado a 0..1; drive ausente ⇒ 0 | Contrato de 8 entradas; cambiar el orden rompe pesos ya entrenados |
| `stimuli` | `[dopamina, cortisol, adenosina]` normalizados a 0..1 (ausente ⇒ 0) | Ejes que más pesan en una decisión: recompensa/apetito, estrés, fatiga. Sustituible con `options.mapStimuli` |
| `genome` | `[alerta, sociabilidad, resiliencia, metabolismo]` (4 genes 0..1), ya conectado mediante `createBrainRuntime()` | Propuesta provisional inspirada en los rasgos del prototipo; confirmarla con Tecnotron. Configurable con `genomeInputGenes`. |
| Salida | `actions = [clamp(action, -1, 1)]`, `debug = { confidence, explored }` | Rango del contrato `BrainOutput`. `BrainV05` devuelve el **código escalar** de la acción elegida (ver `src/brain/actions.ts`), así que el clamp es identidad. La alternativa one-hot exigiría tocar este adaptador y su test de interfaz: propuesta abierta en `REVISIONES.md` |
| `reinforce` | `brain.reinforce(lastAction, clamp(reward,-1,1))`; sin `think()` previo ⇒ no-op | El adaptador recuerda solo la última acción |

## Debug (D2): `getDebugState()` y `BrainDebugState`

Puerto de depuración para `src/render/brain-view.ts` (tarea L2 de lmarena).
Se consume desde la superficie pública del módulo:

```ts
import { BrainV05Adapter } from '../src/brain'; // o desde './brain'
const state = brain.getDebugState(); // BrainDebugState
```

### Mapa de campos de `BrainDebugState`

| Campo | Tipo | Significado | Disponible hoy |
|---|---|---|---|
| `action` | `number` | Acción elegida en el **último** `think()`; `0` si no hay ninguno | ✅ siempre (real) |
| `actionName` | `string` | Nombre legible de esa acción; `'sin-think'` si no ha habido `think()` | ✅ siempre (real) |
| `confidence` | `number` | Confianza de la decisión, recortada a 0..1; `0` sin `think()` | ✅ siempre (real) |
| `explored` | `boolean` | `true` si la acción salió de la exploración ε (no del argmax) | ✅ siempre (real) |
| `hasThink` | `boolean` | `false` ⇒ aún no se ha llamado a `think()` y el resto es neutro | ✅ siempre |
| `hiddenActivations` | `number[]` | Activaciones de la capa oculta, en orden de neurona | ⚠️ `[]` — `BrainV05` real ya está conectado, pero su debug (`BrainV05DebugState`) expone scores/probabilities/lastDecision, **no** estas claves; rellenarlas requiere que la dueña del cerebro amplíe su debug (pendiente de CEO) |
| `outputWeights` | `number[]` | Pesos de la capa de salida, plano (fila a fila) | ⚠️ `[]` — ídem (solo trae `weightNorm`/`weightAbsMax`, no la matriz) |
| `genomeInputs` | `number[]` | Los 4 genes (0..1) realmente enviados como `input.genome` en el último `think()`; `[]` sin `think()` | ✅ siempre (lo aporta el adaptador) |

### Reglas del puerto

1. **Nunca lanza**: sin `think()` previo devuelve el estado neutro documentado
   (`hasThink: false`, `action: 0`, arrays vacíos).
2. `action`/`actionName`/`confidence`/`explored`/`genomeInputs` salen
   **siempre del último `think()` del adaptador** (fuente de verdad), aunque
   el cerebro subyacente implemente `getDebugState?()`.
3. `hiddenActivations`/`outputWeights` los lee de la forma cruda del cerebro
   subyacente **si su debug los incluye** (hoy `BrainV05` no los incluye →
   `[]`); `PlaceholderBrain` devuelve arrays vacíos. Normalización con
   `toNumberArray` (cualquier otra cosa → `[]`, sin inventar valores).
4. **Excepción acotada**: es método (no getter) y solo expone estos campos;
   no expone ε, capas ni arquitectura. Cualquier ampliación necesita
   autorización nueva (constancia en `tests/adapter-interface.test.ts`).

## Composición de runtime

`src/brain/runtime.ts` expone `createBrainRuntime(genome, brainFactory, options)`:
resuelve una vez `Genome.getPhenotype()`, entrega sus knobs a la fábrica del
cerebro y configura `BrainV05Adapter` con un `genomeProvider`. `main.ts` pasa ese
mismo fenotipo a `BiochemEngine`. Los genes de entrada se consultan en cada
`think()`; si cambia el genoma, el vector cambia, pero los knobs y los deltas
bioquímicos son snapshots. Para aplicar una mutación también hay que recalcular
el fenotipo y reconstruir `BiochemEngine` y el runtime cerebral.

El vocabulario se avanza con el mismo `dt` y se puede enseñar desde la UI. **No
se envía aún a `BrainInputs`**: el mapeo a los tres estímulos requiere decisión
de Tecnotron, para no codificar una interpretación no aprobada.

La app (`main.ts`) construye `BrainV05` con los knobs del fenotipo y una semilla
fija, y es también quien llama a `reinforce()`: con la reducción de malestar de
cada tick (interruptor «refuerzo automático») y con los botones premio/castigo.
El adaptador no decide cuándo reforzar, solo recuerda la última acción.

## Archivos

- `src/brain/brainv05-types.ts` — interfaz estructural mínima `BrainV05Like`
  (`think`/`reinforce`/`getDebugState?`/`serialize`/`deserialize`/`dispose` +
  shapes) y el contrato `BrainDebugState`.
- `src/brain/index.ts` — **superficie pública** del módulo (D2): re-exporta
  adaptador, runtime, placeholder, constantes y tipos para que consumidores
  (p. ej. la vista L2) no importen internos.
- `src/brain/adapter.ts` — `BrainV05Adapter implements IBrain` +
  `reinforce()` + `getDebugState()`, constantes `DRIVE_ORDER`/
  `STIMULUS_CHEMICALS` y providers.
- `src/brain/runtime.ts` — une `Genome`, fenotipo, fábrica cerebral y vector genómico.
- `src/brain/brain-v05.ts` — el cerebro real: MLP 15 → `hiddenSize` → 5
  acciones, ε-greedy con suelo 5 %, Hebbiano por recompensa, serializable y
  determinista con semilla. Ver [`CEREBRO.md`](CEREBRO.md).
- `src/brain/actions.ts` — espacio de acciones (codebook escalar en [-1, 1]) y
  helpers de decodificación para quien consume `BrainOutput.actions`.
- `src/brain/reward.ts` — malestar y recompensa por reducción de drive.
- `src/brain/placeholder-brain.ts` — salida neutra constante (acción 0,
  confianza 0); ya no se usa en la app, se mantiene para tests y regresión.
- `src/main.ts` — compone motor, adaptador, visuales y `Vocabulary` en un único bucle.
- `tests/adapter-*.test.ts` (incl. `adapter-debug.test.ts`, D2),
  `tests/brain-runtime.test.ts` (+ helper `tests/fake-brain.ts`).
- `src/brain/stub.ts` — se mantiene intacto (sin eliminar nada de Fase 0).

## Estado de la lista anterior (actualizado en esta rama)

1. ✅ Hecho: `main.ts` construye `BrainV05` con los knobs del fenotipo
   (`hiddenSize`, `epsilonInitial`, `learningRate`) y pasa esa instancia a la
   fábrica de `createBrainRuntime()`.
2. ✅ Hecho: `BrainV05` satisface `BrainV05Like` (test estructural en
   `tests/brain-v05-shape.test.ts`) y no filtra nada al resto del proyecto: el
   adaptador no se ha tocado y `getDebugState()` solo lo lee quien construye el
   cerebro.
3. ⏳ Sigue pendiente de Tecnotron/CEO: confirmar el mapeo de los cuatro genes y
   de los estímulos, decidir cómo (o si) el vocabulario entra en `BrainInputs`,
   y ratificar el **codebook escalar** de la acción frente al one-hot (propuesta
   en `REVISIONES.md`; cambiarlo exige tocar el adaptador y su test).
4. ✅ El placeholder no se ha modificado ni eliminado: el MLP real vive en su
   propio módulo.
