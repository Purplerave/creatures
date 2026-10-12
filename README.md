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

## Estado actual

El scaffold TypeScript/Vite incluye un motor determinista de ocho drives y seis químicos. El puerto visual L1 implementa `IVisuals` con `Path2D`, deriva cuatro estados de ánimo y anima a Nilo sin azar; el hábitat se compone con CSS. La composición de runtime aplica el fenotipo de `Genome` al motor y al adaptador del cerebro, y la UI permite enseñar asociaciones con `Vocabulary`. El cerebro conectado sigue siendo un placeholder; la entrada del vocabulario al cerebro y el mapeo de cuatro genes son decisiones provisionales pendientes de revisión.

## Estructura

- `src/biochem/` — motor determinista, tabla de drives, químicos y reacciones.
- `src/contracts/` — interfaces compartidas entre simulación y módulos.
- `src/visuals/canvasVisuals.ts` — implementación Canvas de `IVisuals`.
- `src/brain/runtime.ts` — compone el fenotipo y el adaptador del cerebro con mapeos configurables.
- `src/genome/` y `src/vocab/` — genoma determinista y vocabulario con olvido.
- `src/main.ts` — bucle principal, render y aprendizaje de palabras mediante snapshots.
- `tests/` — pruebas Vitest del motor, genoma, adaptador, vocabulario y visuales.
- `docs/FASE0.md` — arquitectura, contratos y guía de desarrollo.
- `docs/INTEGRACION-RUNTIME.md` — integración genoma/cerebro/vocabulario y decisiones pendientes.
- `bichito.html` — prototipo original y fuente de los paths SVG.
- `estudio-proyecto-creatures.html`, `report.md`, `notes/` — documentación e investigación del proyecto.
