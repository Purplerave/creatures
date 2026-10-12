# Integración de genoma, cerebro y vocabulario en runtime

Esta nota documenta la composición actual del runtime en la rama de trabajo. La integración mantiene al motor como autoridad del estado y a los módulos de cerebro/visuales/vocabulario como consumidores o componentes independientes.

## Genoma → bioquímica y cerebro

- `Genome.getPhenotype()` se calcula una vez al construir el runtime.
- El mismo fenotipo se entrega a `BiochemEngine` para aplicar deltas de `decayPerSecond` y a la fábrica del cerebro para sus knobs (`hiddenSize`, `epsilonInitial`, `learningRate`).
- `createBrainRuntime()` adapta el cerebro al contrato `IBrain` y obtiene el vector genómico en cada `think()`, por lo que un cambio del genoma se refleja en el vector siguiente. El fenotipo aplicado al motor y los knobs de la fábrica son snapshots; para aplicar una mutación hay que reconstruir `BiochemEngine` y el runtime cerebral. La app aún no muta el genoma en ejecución.
- Mapeo provisional, inspirado en los cuatro rasgos del prototipo Bichito:
  `[alerta, sociabilidad, resiliencia, metabolismo]` → curiosidad, vínculo social, resiliencia y apetito.
- El mapeo se puede reemplazar mediante `genomeInputGenes`; debe confirmarlo Tecnotron antes de considerarlo definitivo.

El genoma inicial usa valores `0.5`: los genes de rasgo producen delta bioquímico cero y los genes de knobs seleccionan el punto medio de sus rangos. Con esos valores la app construye `BrainV05` con **34 neuronas ocultas, ε inicial 0.325 y η 0.155**: los knobs ya tienen efecto real sobre la red.

## Vocabulario

La app instancia `Vocabulary`, lo avanza con el mismo `dt` simulado y permite enseñar una palabra asociada a comida, pelota o luz. Las asociaciones se refuerzan por repetición, decaen con el tiempo y muestran su confianza en la UI.

El vocabulario todavía **no se pasa al cerebro**. `BrainV05Input` dispone de tres valores de estímulo y el contrato de `IVocab` deja pendiente cómo representar las palabras en esos inputs. No se inventa una codificación en esta integración; el mapeo requiere decisión de Tecnotron.

## Cerebro real (conectado en esta rama)

`createBrainRuntime()` recibe ahora una fábrica que instancia `BrainV05`
(`src/brain/brain-v05.ts`), un MLP 15 → `hiddenSize` → 5 acciones con ε-greedy
(suelo 5 %) y aprendizaje Hebbiano modulado por recompensa. Cumple
`BrainV05Like` sin `implements` forzado en el consumidor y el adaptador no se ha
modificado. `PlaceholderBrain` se conserva para tests y regresión.

### Bucle de refuerzo

`main.ts` es quien decide cuándo reforzar (el adaptador solo recuerda la última
acción):

- **Automático:** cada tick calcula el malestar de los drives
  (`src/brain/reward.ts`) y refuerza con `clamp((malestarAntes − malestarAhora) · 6, −1, 1)`.
  Se puede apagar con el interruptor del panel para hacer el A/B. El malestar se
  sigue actualizando apagado, para que al reactivarlo no haya un salto acumulado.
- **Manual:** los botones **Premiar (+1)** y **Castigar (−1)** refuerzan la
  última decisión a través de `BrainV05Adapter.reinforce()`.
- La semilla del cerebro es fija (`20261012`): la partida es reproducible.

Con el mundo aún sin objetos, la señal automática está dominada por la deriva
intrínseca de los drives (la hambre sube sola) y es poco contingente con la
acción; el aprendizaje visible de la demo viene de los botones. En cuanto haya
comida/juego/caricias, la misma función dará aprendizaje por reducción de drive
sin cambios.
