# Integración de genoma, cerebro y vocabulario en runtime

Esta nota documenta la composición actual del runtime en la rama de trabajo. La integración mantiene al motor como autoridad del estado y a los módulos de cerebro/visuales/vocabulario como consumidores o componentes independientes.

## Genoma → bioquímica y cerebro

- `Genome.getPhenotype()` se calcula una vez al construir el runtime.
- El mismo fenotipo se entrega a `BiochemEngine` para aplicar deltas de `decayPerSecond` y a la fábrica del cerebro para sus knobs (`hiddenSize`, `epsilonInitial`, `learningRate`).
- `createBrainRuntime()` adapta el cerebro al contrato `IBrain` y obtiene el vector genómico en cada `think()`, por lo que un cambio del genoma se refleja en el vector siguiente. El fenotipo aplicado al motor y los knobs de la fábrica son snapshots; para aplicar una mutación hay que reconstruir `BiochemEngine` y el runtime cerebral. La app aún no muta el genoma en ejecución.
- Mapeo provisional, inspirado en los cuatro rasgos del prototipo Bichito:
  `[alerta, sociabilidad, resiliencia, metabolismo]` → curiosidad, vínculo social, resiliencia y apetito.
- El mapeo se puede reemplazar mediante `genomeInputGenes`; debe confirmarlo Tecnotron antes de considerarlo definitivo.

El genoma inicial usa valores `0.5`: los genes de rasgo producen delta bioquímico cero y los genes de knobs seleccionan el punto medio de sus rangos. El runtime continúa usando `PlaceholderBrain`, que ignora esos knobs y devuelve una salida neutra; la fábrica ya permite sustituirlo cuando esté disponible el cerebro real.

## Vocabulario

La app instancia `Vocabulary`, lo avanza con el mismo `dt` simulado y permite enseñar una palabra asociada a comida, pelota o luz. Las asociaciones se refuerzan por repetición, decaen con el tiempo y muestran su confianza en la UI.

El vocabulario todavía **no se pasa al cerebro**. `BrainV05Input` dispone de tres valores de estímulo y el contrato de `IVocab` deja pendiente cómo representar las palabras en esos inputs. No se inventa una codificación en esta integración; el mapeo requiere decisión de Tecnotron.

## Cerebro real pendiente

El adapter sigue encapsulando `PlaceholderBrain`; esta rama no implementa un MLP nuevo ni finge que el placeholder aprende. Cuando haya una implementación real, se conecta mediante la fábrica de `createBrainRuntime()` y se valida contra `BrainV05Like`.
