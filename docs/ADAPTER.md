# ADAPTER — D1: Adaptador del cerebro v0.5 (`BrainV05Adapter`)

Estado: **D1 implementado** en la rama `dinopablo/brain-adapter`. Al integrar
el runtime, no había un modelo cerebral real disponible en el repositorio; la
app usa un **placeholder temporal** (`src/brain/placeholder-brain.ts`) que
cumple la misma interfaz estructural.

## Regla del cerebro encapsulado y desechable

El adaptador es la ÚNICA pieza que toca al cerebro. Expone solo
`think()` (contrato `IBrain`) + `reinforce()`; no hay getters ni propiedades
que filtren MLP, pesos, capas ni ε. Cambiar de cerebro = cambiar una línea
(`new BrainV05Adapter(new CerebroReal())`), sin tocar al resto del proyecto.

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
              brain.think(vector)   ← brain-v05 (o placeholder)
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
| Salida | `actions = [clamp(action, -1, 1)]`, `debug = { confidence, explored }` | Rango del contrato `BrainOutput`. Si `action` es índice discreto 0..n-1, valorar one-hot de longitud n |
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

## Archivos

- `src/brain/brainv05-types.ts` — interfaz estructural mínima `BrainV05Like`
  (`think`/`reinforce`/`serialize`/`deserialize`/`dispose` + shapes).
- `src/brain/adapter.ts` — `BrainV05Adapter implements IBrain` + `reinforce()`,
  constantes `DRIVE_ORDER`/`STIMULUS_CHEMICALS` y providers.
- `src/brain/runtime.ts` — une `Genome`, fenotipo, fábrica cerebral y vector genómico.
- `src/brain/placeholder-brain.ts` — **temporal**: salida neutra constante
  (acción 0, confianza 0). No aprende; la fábrica permite sustituirlo por un modelo real.
- `src/main.ts` — compone motor, adaptador, visuales y `Vocabulary` en un único bucle.
- `tests/adapter-*.test.ts`, `tests/brain-runtime.test.ts` (+ helper `tests/fake-brain.ts`).
- `src/brain/stub.ts` — se mantiene intacto (sin eliminar nada de Fase 0).

## Pendiente de revisión e integración del cerebro real

1. Sustituir la fábrica `(_knobs) => new PlaceholderBrain()` por la clase real,
   consumiendo `hiddenSize`, `epsilonInitial` y `learningRate`.
2. Verificar que la clase satisface `BrainV05Like`; ajustar solo la superficie
   estructural si hace falta, sin filtrar los detalles del modelo al resto.
3. Tecnotron debe confirmar el mapeo provisional de los cuatro genes y los
   estímulos; también queda pendiente decidir cómo (o si) el vocabulario entra
   en `BrainInputs` y si la acción es escalar o índice discreto.
4. Mantener el placeholder hasta que el cerebro real esté disponible; no se
   inventa otro MLP dentro del placeholder.
