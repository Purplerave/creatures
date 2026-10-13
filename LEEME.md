# Proyecto «Bichito» — sucesor moderno de Creatures (1996)

**Actualizado:** 13-oct-2026. Proyecto de ocio inspirado en *Creatures*: una mascota web con necesidades, genoma, aprendizaje, vocabulario y, más adelante, un mundo espacial y ciclo de vida. La criatura actual del repo se llama **Nilo**.

**No es un producto vendible: es por puro disfrute.** Lo que fascinaba del original era ver que las criaturas aprendían. La idea es construir un sucesor web simplificado, tomando el diseño de *Creatures* como inspiración y no como una implementación literal de SVRules.

## Estado ejecutable

La app TypeScript/Vite vive en `index.html` + `src/`. Se arranca con `npm ci && npm run dev`. Incluye un motor bioquímico determinista, visuales Canvas, genoma con mutación determinista, vocabulario con olvido y el MLP `BrainV05` con ε-greedy y refuerzo.

El primer corte del mundo por eventos ya enlaza cinco verbos del cerebro con cuatro objetos (nido, comedero, pelota y luz suave). Los objetos emiten impulsos bioquímicos; el motor aplica cada lote validado y recortado a sus clamps. Las decisiones se mantienen 0,75 segundos simulados y la recompensa automática compara el cambio de malestar al cierre de ese intervalo. La UI permite probar cada verbo manualmente sin entrenar al cerebro con esa intervención.

**Límite actual:** todavía no hay posiciones, desplazamiento, colisiones ni habitaciones. Las consecuencias y el mapeo acción→objeto son provisionales. Por ello no se considera validado «aprender a buscar comida» en una partida real, aunque los tests sintéticos sí verifican aprendizaje y reversión de preferencia.

## Qué hay en este paquete

| Archivo o carpeta | Contenido |
|---|---|
| `index.html`, `src/` | App web TypeScript/Vite: bioquímica, visuales, cerebro, mundo, genoma, vocabulario y UI. |
| `src/world/` | Modelo de mundo por eventos, objetos, enfriamientos y consecuencias. |
| `src/brain/brain-v05.ts` | MLP determinista de 15 entradas, cinco acciones, ε-greedy y Hebbiano por recompensa. |
| `src/brain/reward.ts` | Malestar normalizado y recompensa por reducción de drives. |
| `docs/CEREBRO.md` | Modelo cerebral v0.5, fórmulas, aprendizaje, recompensa y serialización. |
| `docs/GENOME.md`, `docs/VOCAB.md` | Diseño e implementación de genoma y vocabulario. |
| `docs/ESTADO-PROYECTO.md`, `docs/REVISIONES.md` | Estado actual, revisión de GitHub y decisiones pendientes. |
| `bichito.html`, `estudio-proyecto-creatures.html`, `report.md`, `notes/` | Prototipo, investigación y hoja de ruta. |

## Probar y desarrollar

```bash
npm ci
npm run dev
```

En la app, usa **Probar acción** para seleccionar un verbo y ver el efecto en los drives; la tarjeta muestra el enfriamiento del objeto. Después puedes dejar actuar a Nilo y premiar/castigar su decisión desde el panel cerebral. También puedes enseñar asociaciones en el panel de vocabulario.

Para verificar la entrega:

```bash
npm run typecheck
npm test
npm run build
```

La suite incluye pruebas unitarias del cerebro, impulsos bioquímicos y mundo por eventos, además de una prueba smoke de la app en DOM simulado. GitHub Actions ejecuta typecheck, tests y build en push y pull request.

## Hacia dónde queremos llevarlo

- **Fase 4 — mundo:** movimiento, posiciones y eventos espaciales para que los objetos se usen a distancia y el aprendizaje por drives tenga una tarea real.
- **Fase 5 — persistencia y ciclo de vida:** exportar/importar y guardar la partida; el cerebro, genoma y vocabulario tienen serialización propia, pero todavía no existe guardado coordinado ni serialización del motor/mundo.
- Después: nuevas generaciones/genomas, más objetos, edad y ciclo de vida.

## Decisiones pendientes

La revisión de producto/técnica debe ratificar el código escalar de las acciones frente a una alternativa one-hot, los mapeos provisionales de genes y estímulos, y si el vocabulario se traduce a entradas cerebrales. Ver [`docs/REVISIONES.md`](docs/REVISIONES.md). No se cambia un contrato ya aprobado sin acordarlo primero.
