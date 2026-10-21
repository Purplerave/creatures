# Proyecto «Bichito» — sucesor moderno de Creatures (1996)

**Actualizado:** 21-oct-2026. Proyecto de ocio inspirado en *Creatures*: una criatura virtual web con fisiología homeostática, genoma con epigenética y traducción molecular NCBI, aprendizaje neuronal Hebbiano, vocabulario asociativo, mundo espacial 2D y ciclo de vida con persistencia completa. La criatura fundadora del repo se llama **Nilo**.

**No es un producto vendible: es por puro disfrute.** Lo que fascinaba del original era ver emerger conducta real de una bioquímica y un cerebro acoplados.

## Estado ejecutable

La aplicación TypeScript/Vite vive en `index.html` + `src/` y se arranca con `npm ci && npm run dev`:

- **Fisiología determinista (`src/biochem/`)**: 8 drives, 6 neuroquímicos, reacciones acopladas, impulsos atómicos y serialización versionada.
- **Visuales L1 espaciales (`src/visuals/canvasVisuals.ts`) y Vista Cerebral L2 (`src/render/brain-view.ts`)**: escenario interactivo 2D con criatura `Path2D`, objetos ordenados por profundidad y bocadillo de habla, acompañado en paralelo por el grafo sináptico en tiempo real conectado exclusivamente al puerto D2 (`BrainV05Adapter.getDebugState()`).
- **Mundo espacial 2D (`src/world/`)**: posiciones normalizadas, desplazamiento continuo sin sobrepaso, radio de interacción, clic directo sobre el hábitat y protocolo A/B reproducible (`tests/spatial-world.test.ts`) donde el agente reforzado aprende a buscar comida en menos de 5 minutos simulados.
- **Genoma F2 + Capa molecular F4 (`src/genome/`)**: cabeceras de ontogenia (`switchOnTime`), mutabilidad por gen, protección de genes críticos en copia primaria, metilación epigenética reversible de 1 bit, duplicación/borrado estructural, cruce haploide (`Genome.crossover`) y tabla estándar NCBI 64→20 en `Uint8Array` con mutaciones sinónimas neutras reales.
- **Persistencia coordinada y cría (Fase 5 — `src/persistence/`)**: guardado/carga en `localStorage`, exportación/importación JSON con restauración transaccional todo-o-nada de los 5 subsistemas e incubación de nuevas generaciones (`hatchOffspring`).

## Qué hay en este paquete

| Archivo o carpeta | Contenido |
|---|---|
| `index.html`, `src/main.ts` | Interfaz de laboratorio en dos columnas, controles de velocidad (`⏸`, `1×`, `2×`, `4×`) y composición de runtime. |
| `src/visuals/`, `src/render/` | Renderizador espacial L1 (`CanvasVisuals`) y vista neuronal L2 (`BrainView` sobre D2). |
| `src/world/` | Mundo espacial 2D, cinemática, radio de interacción, hit-testing y serialización. |
| `src/brain/` | `BrainV05` (MLP 15→H→5), `BrainV05Adapter` (D1/D2), runtime y recompensa homeostática/dopaminérgica. |
| `src/genome/` | Genoma F2 (cabeceras, ontogenia, metilación, mutación estructural, cruce) y capa molecular NCBI (`molecular.ts`). |
| `src/persistence/` | Coordinador atómico de partida (`serializeGameState`, `restoreGameState`, `hatchOffspring`). |
| `docs/` | Especificaciones de arquitectura, contratos, cerebro, genoma, vocabulario y estado del proyecto. |
| `tests/` | **36 suites / 248 tests** unitarios, de integración, benchmark A/B espacial y smoke test de UI. |

## Verificar la entrega

```bash
npm ci
npm run typecheck
npm test
npm run build
```

## Decisiones abiertas para siguientes iteraciones

Se mantienen intactos todos los contratos aprobados (`IBrain` escalar, orden de `DRIVE_ORDER`, `STIMULUS_CHEMICALS` y superficie `D2`). Queda abierto para futuras fases decidir si el vocabulario alimenta canales sensoriales del cerebro y expandir el hábitat a múltiples estancias o interacción multi-criatura. Ver [`docs/REVISIONES.md`](docs/REVISIONES.md).
