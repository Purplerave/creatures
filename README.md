# Creatures 🧬 — una mascota digital con cerebro

Creatures es un proyecto de ocio inspirado en *Creatures* (1996): una criatura virtual con necesidades, aprendizaje y una apariencia que reacciona a su estado.

## Empezar

Requisitos: Node.js 20 o superior.

```bash
npm ci
npm run dev
```

Vite sirve `index.html`, donde Nilo se dibuja en Canvas 2D. Para verificar los cambios:

```bash
npm run typecheck
npm test
npm run build
```

## Enseñarle cosas

Con `npm run dev`, en la página:

1. **Premiar / Castigar** refuerzan la última decisión de Nilo: en pocas pulsaciones verás crecer (o caer) la barra de esa acción en el panel del cerebro.
2. El interruptor **refuerzo automático** añade la señal por reducción de malestar (hambre, sueño, aburrimiento y miedo contra energía, confort y vínculo). Apágalo para desactivar esa fuente de aprendizaje; para comparar sin refuerzo, no pulses tampoco los botones manuales.
3. En **Vocabulario**, escribe una palabra y asóciala a comida, pelota o luz suave; repítela para que quede «aprendida» y deja pasar tiempo simulado para ver cómo se olvida.

El panel del cerebro muestra ε (exploración), decisiones, refuerzos y la probabilidad de cada acción: el aprendizaje se ve en directo.

## Estado actual

El scaffold TypeScript/Vite incluye un motor determinista de ocho drives y seis químicos. El puerto visual L1 implementa `IVisuals` con `Path2D`, deriva cuatro estados de ánimo y anima a Nilo sin azar; el hábitat se compone con CSS. La composición de runtime aplica el fenotipo de `Genome` al motor y al adaptador del cerebro, y la UI permite enseñar asociaciones con `Vocabulary`.

**El cerebro ya es real y aprende**: `BrainV05` (`src/brain/brain-v05.ts`) es un MLP de 15 entradas (8 drives + 3 estímulos + 4 genes) con capa oculta `tanh`, decisión ε-greedy sobre cinco verbos y aprendizaje Hebbiano modulado por recompensa. Los genes `capacidad`, `exploracion` y `aprendizaje` fijan `hiddenSize`, ε inicial y tasa de aprendizaje; ε decae hasta un suelo del 5 %. La app refuerza cada decisión con la reducción de malestar de los drives y con los botones **Premiar/Castigar** del panel «Cerebro de Nilo», donde se ve en directo la probabilidad de cada acción. Todo es determinista con semilla (cero `Math.random()`) y serializable, incluido el estado del azar.

Siguen pendientes de revisión: cómo entra el vocabulario en `BrainInputs`, el mapeo de los cuatro genes de entrada y si la acción viaja como código escalar (lo que hace hoy) o como one-hot. Sin mundo ni objetos interactivos, la recompensa automática es una aproximación débil y no se da por cumplido el hito de buscar comida. Detalles en [`docs/CEREBRO.md`](docs/CEREBRO.md).

## Estructura

- `src/biochem/` — motor determinista, tabla de drives, químicos y reacciones.
- `src/contracts/` — interfaces compartidas entre simulación y módulos.
- `src/visuals/canvasVisuals.ts` — implementación Canvas de `IVisuals`.
- `src/brain/runtime.ts` — compone el fenotipo y el adaptador del cerebro con mapeos configurables.
- `src/brain/brain-v05.ts` — el cerebro real: MLP + ε-greedy + Hebbiano por refuerzo.
- `src/brain/actions.ts` — espacio de acciones (codebook escalar en [-1, 1]).
- `src/brain/reward.ts` — recompensa por reducción de malestar de los drives.
- `src/genome/` y `src/vocab/` — genoma determinista y vocabulario con olvido.
- `src/main.ts` — bucle principal, render, refuerzo de decisiones y aprendizaje de palabras mediante snapshots.
- `tests/` — pruebas Vitest del motor, genoma, adaptador, cerebro, vocabulario, visuales y de la app (`app-smoke`).
- `docs/CEREBRO.md` — modelo cerebral: red, ε-greedy, fórmulas de aprendizaje, recompensa y serialización.
- `docs/FASE0.md` — arquitectura, contratos y guía de desarrollo.
- `docs/INTEGRACION-RUNTIME.md` — integración genoma/cerebro/vocabulario y decisiones pendientes.
- `bichito.html` — prototipo original y fuente de los paths SVG.
- `estudio-proyecto-creatures.html`, `report.md`, `notes/` — documentación e investigación del proyecto.
