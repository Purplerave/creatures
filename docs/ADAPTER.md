# ADAPTER — D1: Adaptador del cerebro v0.5 (`BrainV05Adapter`)

Estado: **D1 implementado y con el cerebro real conectado**. El adaptador sigue
intacto (ni un campo ni un método nuevos: sus tests de interfaz lo fijan); lo que
cambia es la fábrica del runtime, que ahora instancia `BrainV05`
(`src/brain/brain-v05.ts`) en lugar del `PlaceholderBrain` temporal. El modelo,
sus fórmulas y su espacio de acciones se documentan en
[`CEREBRO.md`](CEREBRO.md); el placeholder se conserva en el repo para tests.

## Regla del cerebro encapsulado y desechable

El adaptador es la única pieza que ofrece decisiones al resto del runtime a
través de `IBrain`: expone `think()` y `reinforce()`, sin getters que filtren
pesos o capas. La raíz de composición (`main.ts`) construye `BrainV05` y lee
`getDebugState()` para el panel de diagnóstico; ese acceso de depuración no forma
parte de `IBrain` ni altera la superficie aprobada del adaptador. Cambiar el
modelo de decisión sigue concentrado en la fábrica del runtime.

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
```

## Mapeos provisionales (⚠️ confirmar con Tecnotron/CEO en el pad)

| Entrada | Mapeo actual | Motivo / alternativa |
|---|---|---|
| `drives` | Orden fijo `DRIVE_ORDER` = `[hambre, energia, sueno, curiosidad, vinculo, aburrimiento, miedo, confort]` (espejo del registro de `driveTable.ts`), `level` recortado a 0..1; drive ausente ⇒ 0 | Contrato de 8 entradas; cambiar el orden rompe pesos ya entrenados |
| `stimuli` | `[dopamina, cortisol, adenosina]` normalizados a 0..1 (ausente ⇒ 0) | Ejes que más pesan en una decisión: recompensa/apetito, estrés, fatiga. Sustituible con `options.mapStimuli` |
| `genome` | `[alerta, sociabilidad, resiliencia, metabolismo]` (4 genes 0..1), ya conectado mediante `createBrainRuntime()` | Propuesta provisional inspirada en los rasgos del prototipo; confirmarla con Tecnotron. Configurable con `genomeInputGenes`. |
| Salida | `actions = [clamp(action, -1, 1)]`, `debug = { confidence, explored }` | Rango del contrato `BrainOutput`. `BrainV05` devuelve el **código escalar** de la acción elegida (ver `src/brain/actions.ts`), así que el clamp es identidad. La alternativa one-hot exigiría tocar este adaptador y su test de interfaz: propuesta abierta en `REVISIONES.md` |
| `reinforce` | `brain.reinforce(lastAction, clamp(reward,-1,1))`; sin `think()` previo ⇒ no-op | El adaptador recuerda solo la última acción |

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
  (`think`/`reinforce`/`serialize`/`deserialize`/`dispose` + shapes).
- `src/brain/adapter.ts` — `BrainV05Adapter implements IBrain` + `reinforce()`,
  constantes `DRIVE_ORDER`/`STIMULUS_CHEMICALS` y providers.
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
- `tests/adapter-*.test.ts`, `tests/brain-runtime.test.ts` (+ helper `tests/fake-brain.ts`).
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
