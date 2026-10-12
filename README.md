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

El scaffold TypeScript/Vite incluye un motor de bioquímica determinista con ocho drives y seis químicos. El puerto visual L1 implementa `IVisuals`: reutiliza como `Path2D` los trazos SVG de `bichito.html`, deriva cuatro estados de ánimo de los drives y anima parpadeo, respiración y saltos sin azar. El hábitat se compone con CSS.

## Estructura

- `src/biochem/` — motor determinista, tabla de drives, químicos y reacciones.
- `src/contracts/` — interfaces compartidas entre simulación y módulos.
- `src/visuals/canvasVisuals.ts` — implementación Canvas de `IVisuals`.
- `src/main.ts` — bucle principal; pasa snapshots al render sin cederle la simulación.
- `tests/` — pruebas Vitest del motor y de la clasificación visual.
- `docs/FASE0.md` — arquitectura, contratos y guía de desarrollo.
- `bichito.html` — prototipo original y fuente de los paths SVG.
- `estudio-proyecto-creatures.html`, `report.md`, `notes/` — documentación e investigación del proyecto.
