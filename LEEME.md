# Proyecto «Bichito» — sucesor moderno de Creatures (1996)

**Actualizado:** 12-oct-2026. Proyecto de ocio inspirado en *Creatures*: una mascota web con necesidades, genoma, aprendizaje, vocabulario y, más adelante, objetos y ciclo de vida. La criatura actual del repo se llama **Nilo**.

**No es un producto vendible: es por puro disfrute.** Lo que fascinaba del original era ver que las criaturas aprendían. La idea es construir un sucesor web simplificado, tomando el diseño de *Creatures* como inspiración y no como una implementación literal de SVRules.

## Estado ejecutable del repo

La app TypeScript/Vite vive en `index.html` + `src/` (la forma recomendada de arrancarla es `npm ci && npm run dev`). Ya incluye el motor bioquímico determinista, visuales Canvas, genoma con mutación determinista, vocabulario con olvido y un cerebro MLP que aprende con recompensa. El avance de Fase 3 está implementado en la rama de trabajo, pendiente de revisión cruzada.

El cerebro real (`src/brain/brain-v05.ts`) usa 15 entradas, una capa oculta `tanh`, cinco acciones con selección ε-greedy y aprendizaje Hebbiano modulado por premio/castigo. El panel de Nilo muestra probabilidades, exploración y contadores; los botones **Premiar/Castigar** permiten enseñar manualmente. El refuerzo automático por cambio de malestar está habilitado por defecto y se puede apagar para comparar. El módulo y las limitaciones están descritos en [`docs/CEREBRO.md`](docs/CEREBRO.md).

**Límite actual:** no hay todavía mundo ni objetos interactivos; por tanto, la recompensa automática es poco contingente con la conducta y aún no se puede validar «aprender a buscar comida». La Fase 4 debe aportar objetos y efectos; el A/B sintético en tests verifica el mecanismo, no reemplaza ese hito de juego.

## Qué hay en este paquete

| Archivo o carpeta | Contenido |
|---|---|
| `index.html`, `src/` | App web TypeScript/Vite: bioquímica, visuales, cerebro, genoma, vocabulario y UI. |
| `bichito.html` | Prototipo original en un solo HTML y fuente de algunos paths SVG. |
| `estudio-proyecto-creatures.html` | Estudio del original, alternativas de arquitectura y hoja de ruta. |
| `estudio-creatures-revision.md` | Revisión del estudio. |
| `report.md` | Investigación técnica sobre genoma, SVRule, bioquímica, CAOS, proyectos relacionados y hoja de ruta. |
| `docs/CEREBRO.md` | Modelo del cerebro v0.5, fórmulas, aprendizaje, recompensa y serialización. |
| `docs/GENOME.md`, `docs/VOCAB.md` | Diseño e implementación de genoma y vocabulario. |
| `docs/`, `notes/` | Arquitectura, estado, decisiones y notas de investigación. |

## Probar y desarrollar

```bash
npm ci
npm run dev
```

Para verificar la entrega:

```bash
npm run typecheck
npm test
npm run build
```

La suite incluye pruebas unitarias del cerebro y una prueba smoke de la app en DOM simulado. GitHub Actions ejecuta typecheck, tests y build en pushes y pull requests.

## Hacia dónde queremos llevarlo

- **Fase 4:** mundo 2D con objetos funcionales (comer, jugar, acariciar) y acciones que tengan consecuencias. Esto permitirá una recompensa por reducción de drive ligada a la conducta y validar el aprendizaje de objetivos.
- **Fase 5:** exportar/importar y guardar la partida en IndexedDB; el cerebro, el genoma y el vocabulario ya tienen serialización propia, falta coordinarlas desde la app.
- Después: nuevas generaciones/genomas, más objetos, edad y ciclo de vida.

## Decisiones pendientes

La revisión cruzada debe ratificar el código escalar de las acciones frente a una alternativa one-hot, los mapeos provisionales de genes/estímulos y si el vocabulario alimentará `BrainInputs`. Ver [`docs/REVISIONES.md`](docs/REVISIONES.md). Cambiar un contrato aprobado se propone antes de tocarlo.
