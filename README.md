# Creatures 🧬 — una mascota digital con cerebro, genoma y mundo espacial

Proyecto de ocio inspirado en *Creatures* (1996): una criatura virtual web con fisiología homeostática, genoma con epigenética y código genético molecular, red neuronal con aprendizaje Hebbiano, vocabulario asociativo, mundo espacial 2D y persistencia transaccional de partida. La criatura fundadora se llama **Nilo**.

## Empezar

Requisitos: Node.js 20 o superior.

```bash
npm ci
npm run dev
```

Abre la URL local que muestra Vite (normalmente `http://localhost:5173`). Para comprobar la entrega completa:

```bash
npm run typecheck
npm test
npm run build
```

## Probar la aplicación

1. **Hábitat espacial interactivo (`#app`)**: haz clic sobre cualquier objeto del escenario (**Nido**, **Pelota**, **Luz suave**, **Comedero**) o sobre el suelo para guiar a Nilo en 2D, o deja que su red neuronal navegue autónomamente. El conmutador **Exigir cercanía** obliga a que Nilo alcance físicamente `interactionRadius` antes de consumir el objeto.
2. **Vista cerebral en vivo L2 (`#brain-canvas`)**: inspecciona en tiempo real la topología `15 → hiddenSize → 5` alimentada exclusivamente por el puerto D2 (`BrainV05Adapter.getDebugState()`): canales sensoriales/genéticos, activaciones `tanh` de la capa oculta, sinapsis excitatorias/inhibitorias y probabilidades de acción.
3. **Supervisión y refuerzo**: usa **Premiar (+1)** o **Castigar (−1)** para reforzar la última decisión de `BrainV05`, o alterna **Refuerzo automático** (reducción de malestar entre decisiones). **Probar acción** permite verificar manualmente cualquier verbo sin atribuirlo al cerebro.
4. **Genoma F2, epigenética y capa molecular NCBI (`#genome-panel`)**: metila o desmetila cualquier gen (marca epigenética reversible de 1 bit sin alterar secuencia), aplica **Mutar genoma (F2)** (mutación paramétrica + duplicación/omisión estructural respetando genes críticos) o pulsa **Incubar cría (GEN+1)** para criar descendencia por herencia haploide, observando en vivo el marco abierto de lectura `5′ ATG-…-TAA 3′` y su péptido traducido.
5. **Vocabulario y persistencia coordinada (Fase 5)**: enseña palabras asociadas a estímulos (Nilo pronuncia en bocadillo las asociaciones aprendidas al interactuar) y guarda/carga en navegador o exporta/importa JSON transaccional con los 5 subsistemas sincronizados.

## Estado actual

- **Fase 0–3 + L1 + D1/D2 + L2 (`src/biochem/`, `src/visuals/`, `src/brain/`, `src/render/`)**: motor determinista con 8 drives, 6 químicos, reacciones extensibles e impulsos atómicos; `CanvasVisuals` espacial con `Path2D`; `BrainV05` + `BrainV05Adapter` (`IBrain` + puerto D2) + vista cerebral independiente `BrainView` (`src/render/brain-view.ts`).
- **Fase 4 espacial (`src/world/`)**: coordenadas 2D normalizadas, movimiento continuo sin sobrepaso, radio de interacción, espera en enfriamiento, `hitTestObject()` para clics en canvas y protocolo A/B determinista (`tests/spatial-world.test.ts`) que demuestra aprendizaje autónomo de comida en `< 5` minutos simulados.
- **Genoma F2 + Capa molecular F4 (`src/genome/`)**: cabeceras ricas (`family`, `switchOnTime` ontogenético, `mutability`, protección `critical`), metilación reversible de 1 bit, mutación estructural (`mutateStructural`), cruce generacional (`Genome.crossover`) y tabla estándar NCBI de 64 codones en `Uint8Array` (`src/genome/molecular.ts`).
- **Fase 5 — persistencia y ciclo de vida (`src/persistence/`)**: serialización/deserialización atómica en `BiochemEngine`, `CreatureWorld`, `BrainV05`, `Genome` y `Vocabulary`, restaurada en cuarentena todo-o-nada por `restoreGameState()` más incubación generacional (`hatchOffspring()`).

**Decisiones vigentes:** se conserva el codebook escalar de `IBrain`; el vocabulario permanece como capa expresiva desacoplada del cerebro, según [docs/REVISIONES.md](docs/REVISIONES.md). Las siguientes expansiones de producto y los criterios para acometerlas están en la [hoja de ruta](docs/ROADMAP.md).

## Estructura

- `src/biochem/` — motor determinista, tabla de drives, químicos, reacciones, impulsos y serialización atómica.
- `src/contracts/` — interfaces compartidas entre simulación y módulos (`IBiochem`, `IBrain`, `IGenome`, `IVisuals`, `IVocabulary`).
- `src/visuals/canvasVisuals.ts` — renderizador Canvas 2D espacial (`IVisuals` L1) y proyección `screenToWorld()`.
- `src/render/brain-view.ts` — visualizador neuronal Canvas 2D independiente (L2 sobre puerto D2).
- `src/brain/` — adaptador D1/D2, runtime, MLP v0.5, acciones, malestar y recompensa neuromodulada.
- `src/world/` — mundo espacial 2D y de eventos, cinemática sin sobrepaso, hit-test y serialización.
- `src/genome/` — genoma F2 con ontogenia, metilación, duplicación/omisión, cruce y capa molecular NCBI 64→20.
- `src/vocab/` — vocabulario asociativo con confianza, olvido exponencial y serialización.
- `src/persistence/` — coordinador transaccional de partida completa, almacenamiento local y cría generacional.
- `src/main.ts` — raíz de composición, bucle de simulación con escala temporal y UI de dos columnas.
- `tests/` — **36 suites / 248 tests** deterministas en Vitest.

## Contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md) para las verificaciones y las reglas de contratos. El repositorio aún no declara una licencia; no asumas permisos de reutilización.
