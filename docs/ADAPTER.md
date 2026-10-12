# ADAPTER — D1: Adaptador del cerebro v0.5 (`BrainV05Adapter`)

Estado: **D1 implementado** en la rama `dinopablo/brain-adapter`. El cerebro
real (`tecnotron/brain-v05`, de Tecnotron) **aún no estaba en el remoto** al
implementar, así que se usa un **placeholder temporal**
(`src/brain/placeholder-brain.ts`) tras la misma interfaz estructural.

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
| `genome` | `[0, 0, 0, 0]` — **pendiente de cablear genoma** | Sustituible con `options.mapGenome`; helper listo: `genomeProvider(getGene, ids)` sobre `Genome.getGene()` |
| Salida | `actions = [clamp(action, -1, 1)]`, `debug = { confidence, explored }` | Rango del contrato `BrainOutput`. Si `action` es índice discreto 0..n-1, valorar one-hot de longitud n |
| `reinforce` | `brain.reinforce(lastAction, clamp(reward,-1,1))`; sin `think()` previo ⇒ no-op | El adaptador recuerda solo la última acción |

## Archivos

- `src/brain/brainv05-types.ts` — interfaz estructural mínima `BrainV05Like`
  (`think`/`reinforce`/`serialize`/`deserialize`/`dispose` + shapes).
- `src/brain/adapter.ts` — `BrainV05Adapter implements IBrain` + `reinforce()`,
  constantes `DRIVE_ORDER`/`STIMULUS_CHEMICALS`/`GENOME_DEFAULT` y providers.
- `src/brain/placeholder-brain.ts` — **temporal**: salida neutra constante
  (acción 0, confianza 0). NO es un MLP; se reemplaza en este único fichero
  cuando suba `tecnotron/brain-v05`.
- `src/main.ts` — instancia el adaptador en bucle de render (sustituye al stub).
- `tests/adapter-vector.test.ts`, `tests/adapter-reinforce.test.ts`,
  `tests/adapter-interface.test.ts` (+ helper `tests/fake-brain.ts`).
- `src/brain/stub.ts` — se mantiene intacto (sin eliminar nada de Fase 0).

## Qué falta al llegar `tecnotron/brain-v05`

1. Verificar que la clase real satisface `BrainV05Like` estructuralmente
   (si no, solo ajustar `brainv05-types.ts` — no el adaptador).
2. En `src/main.ts`, cambiar `new PlaceholderBrain()` por la clase real
   (import desde la rama/merge de la CEO). Borrar `placeholder-brain.ts`.
3. Confirmar en el pad: orden/contenido de `stimuli`, origen del `genoma`
   (¿4 genes de `src/genome/`? ¿cuáles?) y si `action` es escalar o índice
   discreto (one-hot).
4. Cablear `genomeProvider(...)` con el `Genome` real y los knobs del
   fenotipo (`hiddenSize`, `epsilonInitial`, `learningRate`) al construir el
   cerebro.
