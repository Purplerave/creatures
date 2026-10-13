# Integración de genoma, cerebro, mundo y vocabulario

La integración mantiene al motor como autoridad del estado bioquímico. Cerebro y mundo intercambian acciones/impulsos; visuales y UI leen snapshots. El motor solo cambia por `tick()` y por impulsos validados de eventos.

## Genoma → bioquímica y cerebro

- `Genome.getPhenotype()` se calcula al construir el runtime.
- El fenotipo se entrega a `BiochemEngine` para aplicar deltas de `decayPerSecond` y a la fábrica cerebral para sus knobs (`hiddenSize`, `epsilonInitial`, `learningRate`).
- `createBrainRuntime()` consulta el vector de genes en cada `think()`. El fenotipo aplicado al motor y los knobs de la fábrica son snapshots; para aplicar una mutación hay que reconstruir motor y runtime cerebral. La app aún no muta el genoma en ejecución.
- Mapeo provisional de entradas genómicas: `[alerta, sociabilidad, resiliencia, metabolismo]`. El helper `genomeInputGenes` permite reemplazarlo, pendiente de confirmación.

Con el genoma por defecto (todos los genes a `0.5`) el cerebro se construye con **34 neuronas ocultas, ε inicial 0.325 y η 0.155**.

## Mundo por eventos → bioquímica → recompensa

`src/world/` enlaza `descansar`/`acurrucarse` con el nido, `buscar` con el comedero, `explorar` con la pelota y `observar` con la luz suave. Los objetos imponen enfriamientos deterministas; una interacción disponible devuelve un `BiochemicalImpulse` de drives/químicos.

`BiochemEngine.applyImpulse()` valida todos los IDs y valores del lote antes de mutar ningún campo, aplica los deltas y recorta cada entidad a su rango. El mundo no recibe ni muta el motor directamente.

La app sostiene una decisión cerebral durante **0,75 segundos simulados**. En la decisión siguiente calcula la variación de malestar y, si el refuerzo automático está activo, refuerza la decisión anterior a través del adaptador. El baseline sigue el tiempo mientras el refuerzo está apagado. **Probar acción** en la UI ejecuta un verbo manualmente; se omite el siguiente refuerzo automático para no acreditar al cerebro el cambio externo.

Límite: el mundo aún es abstracto/de eventos, no espacial. No hay posiciones, movimiento, colisiones, salas ni acercamiento a objetos; los verbos usan el objeto asociado directamente. Las magnitudes y cooldowns son valores iniciales, no calibrados.

## Vocabulario

La app instancia `Vocabulary`, lo avanza con el mismo `dt` simulado y permite enseñar palabras asociadas a comida, pelota o luz. Las asociaciones ganan confianza por repetición, decaen con el tiempo y aparecen en la UI.

El vocabulario todavía **no se pasa al cerebro**. `BrainV05Input` tiene tres valores de estímulo; el contrato `IVocab` no define cómo representar palabras en esos canales. No se inventa una codificación implícita; queda por decidir.

## Depuración del cerebro (D2)

`BrainV05Adapter.getDebugState()` proporciona el puerto D2 acotado: última acción, confianza, exploración, genes usados y arrays de activaciones/pesos vacíos (el adaptador no filtra internals del MLP). El modelo `BrainV05` ofrece además su propio `BrainV05DebugState` de puntuaciones, probabilidades, recompensa y contadores.

La UI actual muestra decisión, probabilidades, ε y contadores en `main.ts`; el modelo lo lee la composición que lo construye. El módulo independiente de render de depuración L2 (`src/render/brain-view.ts`) no está presente en este checkout.

## Persistencia pendiente

Cerebro, genoma y vocabulario son serializables por separado. Falta una serialización versionada del motor y del mundo y un coordinador de partida que guarde/restaure todos los módulos desde UI o almacenamiento local. No se debe considerar implementada la Fase 5.
