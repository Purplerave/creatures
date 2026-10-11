# Notas sección 4: enfoques modernos (2024-2026)

## Fuentes (index, leídas 2026-10-11)
- https://github.com/michaelgrabinski/neataptic (fork mantenido del repo original)
- https://en.wikipedia.org/wiki/Neuroevolution_of_augmenting_topologies
- https://github.com/romainsimon/neuroevolution (NEAT con TF.js, WIP)
- https://github.com/anshk1234/flappy-bird-neural-networking (sandbox neuroevolutivo 100% cliente, activo sept 2026, MIT)
- https://github.com/j8ckfi/cfc-mlx (CfC con NCP, Apple MLX)
- http://arxiv.org/pdf/2106.13898v2 (paper CfC, Hasani et al.)
- https://abvcreative.medium.com/liquid-neural-networks-now-with-actual-maths-part-i (enero 2025: solución cerrada exacta LNN, TechRxiv)
- https://github.com/thechimpmatrix/nornbrain (uso de CfC+NCP para Creatures 3, abril 2026)
- Fuentes varias sobre TensorFlow.js / brain.js

## Hallazgos

### Redes pequeñas entrenadas por refuerzo en el navegador
- TensorFlow.js: permite definir, entrenar y ejecutar modelos en el navegador (WebGL). Viable para políticas pequeñas (p. ej. MLP 60→64→14 acciones). Entrenar RL online en cliente es posible pero caro; lo práctico es pre-entrenar offline y ejecutar inferencia en el cliente, o entrenar "a ratos" en background.
- brain.js: redes pequeñas GPU-aceleradas, muy simple; originalmente solo feedforward/supervisado; el mantenedor trabajaba en "reinforcement neural nets" pero el proyecto tiene un solo desarrollador y va lento. Para comportamiento de mascotas es más simple de lo necesario: basta un MLP pequeño.
- Conclusión: inferencia de redes pequeñas en JS es trivial (unas pocas decenas de miles de parámetros a 60fps). El problema no es inferencia sino el bucle de aprendizaje.

### NEAT (neuroevolución)
- neataptic (la lib JS de referencia): marcada como UNMAINTAINED por su autor (wagenaartje), aunque usable "as-is" vía CDN npm. Hay fork michaelgrabinski/neataptic intentando mantenerla.
- Alternativas: TinyNEAT (TypeScript, 2023), paquete `neuroevolution` (romainsimon, NEAT con TF.js, WIP).
- Los experimentos evolutivos en navegador funcionan (sandbox flappy-bird 2026 demuestra GA en tiempo real 100% cliente), pero evolucionar el CEREBRO EN VIVO de una mascota que el usuario quiere estable es mala UX: el aprendizaje debe ser Hebbiano/refuerzo suave (como STW/LTW de Creatures), no re-evolución generacional en runtime. NEAT encaja mejor como herramienta de diseño offline (evolucionar arquitecturas/pesos iniciales = "instintos"), no como aprendizaje durante el juego.

### CfC / NCP (redes líquidas)
- El proyecto nornbrain usa CfC (closed-form continuous-time) + Neural Circuit Policy para reemplazar el lóbulo de combinación de C3: 239 neuronas en 4 módulos (tálamo, amígdala, hipocampo, prefrontal).
- No se encontró implementación JS madura de CfC, pero la forma cerrada no necesita solver ODE: es implementable en JS puro con pocas fórmulas (el paper da el algoritmo). Una red CfC de ~200 neuronas cabe perfectamente en cliente.
- Ventaja: dinámica temporal continua nativa (constantes de tiempo por neurona) → atención/memoria de trabajo "gratis", sin recurrencias discretas complejas.

### Modelos de drives/necesidades
- El diseño de Creatures (20 drives como químicos con half-life, estímulos que los modifican, refuerzo = reducción de drive) sigue siendo el patrón más probado para mascotas virtuales: es barato (unos pocos floats por drive), interpretable y produce comportamiento emergente creíble.
- Equivalente moderno: utility AI / need-based agents (muy usado en videojuegos). Recomendación: conservar la arquitectura drive-reduction del original.

### Memoria episódica
- Creatures la aproximaba con el lóbulo de concepto (memorias de eventos como conjunciones situación→acción reforzadas).
- Enfoque moderno viable en cliente: buffer de episodios (situación, acción, resultado/delta-drives) con decaimiento, usado para (a) modulación de utilidad de acciones, (b) "sueño"/consolidación offline. No hace falta memoria diferenciable: un kNN sobre embeddings pequeños o incluso hashing de estados discretizados basta.
- Coste: despreciable (cientos de episodios en memoria).

### Viabilidad global en JS cliente sin servidores
- El cerebro original (1000 neuronas, 5000 sinapsis, 10 criaturas) estaba diseñado para PCs de 1996: en JS moderno es trivial (microsegundos por tick).
- Persistencia: localStorage/IndexedDB para genomas y estado; exportar/importar JSON.
- Sin servidor: todo lo anterior cabe en una página estática. Entrenamiento pesado (destilación, pre-entrenamiento de instintos) se haría offline en Python y se empaquetaría como pesos iniciales.
