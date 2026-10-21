# Revisiones, coordinación y decisiones abiertas

**Actualizado:** 21-oct-2026 · **Rama activa:** `arena/f7085e8d-creatures`.

## Integraciones verificadas y trabajo completado en esta rama

- **D1 — adaptador del cerebro (`src/brain/adapter.ts`):** intacto y sellado por `tests/adapter-interface.test.ts`.
- **D2 — puerto de debug (`BrainV05Adapter.getDebugState()`):** intacto en `adapter.ts`; `BrainV05.getDebugState()` expone ahora copias defensivas de `hiddenActivations` y `outputWeights` tras `think()` (`[]` antes de `think()`), habilitando la vista neuronal sin abrir getters ni tocar la superficie pública de `BrainV05Adapter`.
- **L1 espacial (`src/visuals/canvasVisuals.ts`) + L2 neuronal (`src/render/brain-view.ts`):** renderizador de hábitat interactivo 2D y visualizador independiente del grafo neuronal consumiendo únicamente `D2`. *(Nota: `docs/L1-PORT-VISUAL.md` llegó por rebase tardío en `23dac4d`; se conserva como referencia histórica de L1).*
- **Fase 4 completa (`src/world/world.ts`):** coordenadas 2D, desplazamiento continuo sin sobrepaso, alcance físico (`requireProximity`), espera en enfriamiento, `hitTestObject()` y protocolo A/B determinista en `tests/spatial-world.test.ts` (`< 5` min simulados).
- **F2 «Genoma Creatures» + F4 «Capa molecular» (`src/genome/`):** cabeceras ricas (`switchOnTime`, `mutability`, `critical`, `expressed`), metilación epigenética de 1 bit, mutación estructural con duplicación/omisión segura, `Genome.crossover()` y tabla estándar NCBI de 64 codones (`Uint8Array`) en `src/genome/molecular.ts`.
- **Fase 5 — persistencia coordinada y ciclo de vida (`src/biochem/engine.ts`, `src/world/world.ts`, `src/persistence/`):** serialización versionada de los 5 subsistemas, restauración atómica en cuarentena (`restoreGameState`), guardado/carga local, exportación/importación JSON e incubación de descendencia (`hatchOffspring`).

## Decisiones de diseño respetadas (no modificadas unilateralmente)

1. **Transporte escalar de acciones (`BrainOutput.actions = [scalar]`)**: conservado al 100 % sin romper `IBrain`.
2. **Orden de canales de `BrainV05Adapter`**: `DRIVE_ORDER` (8 drives), `STIMULUS_CHEMICALS` (`[dopamina, cortisol, adenosina]`) y los 4 genes de entrada (`[alerta, sociabilidad, resiliencia, metabolismo]`) permanecen intactos.
3. **Vocabulario → `BrainInputs`**: se mantiene sin puente implícito hacia la red neuronal; Nilo expresa sus asociaciones aprendidas en el bocadillo visual del hábitat al interactuar con estímulos conocidos.
4. **Licencia del repositorio**: sigue sin añadirse ningún archivo `LICENSE` sin decisión explícita de la persona propietaria.

## Verificación

Validación completa ejecutada en `arena/f7085e8d-creatures`:

- `npm run typecheck` — **0 errores** (`strict: true`).
- `npm test` — **36 suites / 248 tests pasando**.
- `npm run build` — build de producción generada en `dist/` sin advertencias.
