# Creatures — estado del proyecto

**Actualizado:** 12-oct-2026 · **Repo:** https://github.com/Purplerave/creatures
**Estado:** avance de Fase 3 implementado en `arena/538d2007-creatures`; pendiente de revisión cruzada antes de integrar en `main`.

## Resumen

| Área | Estado | Notas |
|---|---|---|
| **Fase 0 — Andamiaje y bioquímica** | ✅ Implementado | TypeScript + Vite; motor determinista con 8 drives, 6 químicos y reacciones extensibles. |
| **Visuales L1** | ✅ Implementado | `CanvasVisuals`, paths Canvas/`Path2D`, estados de ánimo derivados de drives y hábitat CSS. |
| **Genoma** | ✅ Implementado | Genes extensibles, mutación determinista, fenotipo y serialización; documentado en [`GENOME.md`](GENOME.md). |
| **Vocabulario** | ✅ Implementado | Enseñanza por asociación, confianza, olvido y serialización; el input al cerebro sigue deliberadamente sin definir. Ver [`VOCAB.md`](VOCAB.md). |
| **Cerebro v0.5 / avance Fase 3** | 🟡 Implementado en esta rama; revisión pendiente | MLP determinista + ε-greedy + aprendizaje Hebbiano modulado por recompensa; codebook de acciones, recompensa por drives y UI de premio/castigo. Detalles y límites en [`CEREBRO.md`](CEREBRO.md). |
| **Fase 4 — Mundo y objetos** | ⏳ Pendiente | No hay comida, pelota interactiva ni eventos de mundo. Por eso la recompensa automática todavía no es contingente con lo que hace la criatura. |
| **Fase 5 — Persistencia de partida** | ⏳ Pendiente | El cerebro, genoma y vocabulario son serializables, pero aún no hay guardado/carga integrado en UI/IndexedDB. |

## Cerebro: qué está validado y qué no

- La entrada es de 15 valores: 8 drives, 3 estímulos químicos provisionales y 4 genes provisionales.
- La salida usa cinco acciones (`descansar`, `acurrucarse`, `observar`, `explorar`, `buscar`) transportadas por un código escalar en [-1, 1]. El adaptador aprobado y su superficie de interfaz permanecen intactos.
- El bucle de demo aplica premio/castigo manual y, si está activado, recompensa cada decisión anterior con el cambio de malestar. El panel hace visibles acciones, probabilidades, decisiones, refuerzos y ε.
- Las pruebas verifican determinismo, aprendizaje de una acción objetivo en un problema de bandit sintético, refuerzo negativo, reversión de preferencia, serialización/reproducción del PRNG e integración con genoma, bioquímica y adaptador.
- **No se afirma que esté cumplido el hito completo de la hoja de ruta** («buscar comida en <5 min»): sin objetos/mundo no existe una tarea de búsqueda de comida. Ese hito depende de Fase 4. El A/B sintético y el interruptor de refuerzo sirven para validar el mecanismo, no sustituyen la prueba de juego final.

## Decisiones para revisión cruzada

1. Ratificar el codebook escalar actual o acordar una salida one-hot. Cambiar a one-hot tocaría el adaptador aprobado y su test de interfaz; no se hace unilateralmente.
2. Confirmar los cuatro genes y los tres estímulos provisionales. La configuración del adaptador permite sustituir esos mapeos.
3. Definir si/how el vocabulario se traduce a `BrainInputs`; no se inventa un puente implícito.
4. Diseñar mundo/objetos y efectos de las acciones para que la reducción de drives dependa de la conducta.

## Verificación local de esta entrega

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Resultado esperado/registrado para esta rama: **typecheck limpio, 27 archivos de tests / 207 tests en verde y build Vite correcto**. CI de GitHub ejecuta los mismos tres pasos en push y pull request.

## Reglas de coordinación

- Trabajar en ramas; `main` no se integra sin revisión cruzada.
- Antes de proponer la integración, pasar `npm run typecheck`, `npm test` y `npm run build`.
- Coordinar revisiones y decisiones en [`REVISIONES.md`](REVISIONES.md) y en GitHub. El pad de ScratchThePad no está disponible para los agentes del repo.
