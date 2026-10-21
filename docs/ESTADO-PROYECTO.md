# Creatures — estado del proyecto

**Actualizado:** 21-oct-2026 · **Repo:** https://github.com/Purplerave/creatures · **Base estable:** `main` (`04c61e1`, PR #6 y PR #7 fusionadas).

## Nota sobre historial reciente de `main`

- PRs **#1, #2, #3, #4 y #5** fusionados en `main`.
- Nota documental sobre `docs/L1-PORT-VISUAL.md`: el commit `23dac4d` en `main` incorporó por rebase tardío el brief original de DinoPablo (12-oct-2026) para L1, cuando L1 (`src/visuals/canvasVisuals.ts`) ya estaba implementada en el repo. En esta rama se preserva intacta su retrocompatibilidad, se amplía `CanvasVisuals` con renderizado espacial 2D y se completa además el módulo visual **L2 (`src/render/brain-view.ts`)** que sí figuraba pendiente en `ADAPTER.md` y `REVISIONES.md`.

## Resumen funcional actual

| Área | Estado | Notas |
|---|---|---|
| **Fase 0 — andamiaje y bioquímica** | ✅ Completa | TypeScript estricto + Vite; 8 drives, 6 químicos, reacciones extensibles, impulsos atómicos y `serialize()`/`deserialize()` atómico. |
| **Visuales L1 (`src/visuals/`)** | ✅ Completa + espacial | `CanvasVisuals` con `Path2D`, hábitat espacial 2D, objetos ordenados por profundidad, ciclo de marcha, bocadillo de habla y `screenToWorld()`. |
| **Vista cerebral L2 (`src/render/`)** | ✅ Completa | `BrainView` independiente consumiendo exclusivamente el puerto D2 (`BrainV05Adapter.getDebugState()`): modos `idle`, `placeholder` y `mlp` vivo. |
| **Genoma F2 + Molecular F4 (`src/genome/`)** | ✅ Completa | Cabeceras (`family`, `switchOnTime`, `mutability`, `critical`), metilación reversible de 1 bit, `mutateStructural()`, `Genome.crossover()` y tabla NCBI 64→20 (`Uint8Array`) en `molecular.ts`. |
| **Vocabulario (`src/vocab/`)** | ✅ Completa | Asociación palabra↔estímulo, confianza, olvido exponencial, serialización y recuerdo expresivo en bocadillo de Nilo. |
| **Cerebro v0.5 (`src/brain/`)** | ✅ Completa | MLP determinista 15→`hiddenSize`→5 + ε-greedy + Hebbiano modulado por recompensa + helper `neuromodulatedReward()` (RPE de Schultz). |
| **Fase 4 — mundo espacial (`src/world/`)** | ✅ Completa | Coordenadas 2D, cinemática sin sobrepaso, `requireProximity`, espera ante enfriamiento, `hitTestObject()`, serialización y benchmark A/B reproducible (`< 5` min simulados). |
| **Fase 5 — persistencia y ciclo de vida (`src/persistence/`)** | ✅ Completa | Guardado/carga coordinado y transaccional (todo-o-nada) de los 5 subsistemas, almacenamiento local, exportar/importar JSON e incubación generacional (`hatchOffspring`). |

## Qué está validado con pruebas deterministas

- **Aislamiento de contratos y puertos**: `tests/adapter-interface.test.ts` y `tests/adapter-debug.test.ts` siguen pasando sin tocar `src/brain/adapter.ts`; `tests/brain-view.test.ts` verifica L2 sobre D2.
- **Aprendizaje autónomo espacial A/B (`tests/spatial-world.test.ts`)**: dos episodios idénticos de 240 s simulados (`< 5` min) comparan `BrainV05` con refuerzo activo frente al control sin refuerzo navegando en 2D con `requireProximity: true`. El agente reforzado acude sustancialmente más al comedero, eleva `P(buscar | hambre)` en `> +25` puntos porcentuales y reduce tanto el malestar medio integrado como el malestar final, con reproducibilidad bit a bit.
- **Genética F2 y código molecular F4 (`tests/genome-creatures.test.ts`, `tests/genome-molecular.test.ts`)**: ontogenia por edad, protección absoluta de copia primaria de genes críticos frente a borrado, reversibilidad de metilación epigenética, cruce generacional y neutralidad fenotípica de mutaciones sinónimas en 3ª base (*wobble*).
- **Persistencia transaccional (`tests/biochem-serialize.test.ts`, `tests/persistence-coordinator.test.ts`)**: igualdad bit a bit de trayectorias posteriores a `restoreGameState()` y rollback completo ante corrupción de cualquier submódulo.

## Verificación local

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Resultado actual en `arena/f7085e8d-creatures`: **36 archivos de test / 248 tests en verde**, `tsc --noEmit` limpio y build de producción Vite sin advertencias.

## Decisiones abiertas para futuras expansiones

1. Decidir si en futuras versiones el vocabulario alimenta `BrainInputs.stimuli` (actualmente se mantiene desacoplado de la red para respetar el contrato aprobado).
2. Evaluar múltiples habitaciones, ecología con agotamiento/reposición ambiental y convivencia de varias criaturas en el mismo hábitat.
3. Declarar una licencia explícita únicamente cuando la persona propietaria del repositorio la elija.
