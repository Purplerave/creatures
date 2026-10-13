# Creatures — estado del proyecto

**Actualizado:** 13-oct-2026 · **Repo:** https://github.com/Purplerave/creatures

## Auditoría de GitHub

Revisión del remoto `main` (`6daad082`, merge del PR #4):

- PRs **#1, #2, #3 y #4 están fusionados**; no hay pull requests abiertos.
- No hay issues abiertos.
- La última ejecución de GitHub Actions sobre `main` figura **success** ([run 38292996496](https://github.com/Purplerave/creatures/actions/runs/38292996496)).
- El repositorio no tiene un backlog GitHub abierto para las fases que faltan; esas tareas están descritas aquí y en [`REVISIONES.md`](REVISIONES.md).
- `main` tampoco tiene licencia declarada, release/tag, `CONTRIBUTING.md` ni plantillas de issue/PR. No conviene inventar una licencia sin autorización.

La rama de trabajo de esta sesión, `arena/4651a715-creatures`, contiene cambios locales posteriores a ese `main`; todavía no hay PR/CI remoto para esos cambios. Esta rama añade guía de contribución y plantillas para bugs, mejoras y pull requests; aún no son visibles en GitHub remoto.

## Resumen funcional

| Área | Estado | Notas |
|---|---|---|
| **Fase 0 — andamiaje y bioquímica** | ✅ Implementada | TypeScript + Vite; motor determinista con 8 drives, 6 químicos, reacciones extensibles e impulsos atómicos de mundo. |
| **Visuales L1** | ✅ Implementadas | `CanvasVisuals`, paths Canvas/`Path2D`, ánimo derivado de drives y hábitat CSS. |
| **Genoma** | ✅ Implementado | Genes extensibles, mutación determinista, fenotipo y serialización. |
| **Vocabulario** | ✅ Implementado | Enseñanza por asociación, confianza, olvido y serialización; el vector cerebral no consume palabras aún. |
| **Cerebro v0.5 / Fase 3** | ✅ Integrado en `main` | MLP determinista + ε-greedy + Hebbiano modulado por recompensa; debug D2 y panel de actividad. La prueba de comida real sigue pendiente del mundo. |
| **Fase 4 — mundo por eventos** | 🟡 Primer corte en esta rama | Cuatro objetos, cinco verbos, enfriamientos, impulsos a bioquímica, efecto visible y control manual de prueba. No hay movimiento/colisiones/habitaciones. |
| **Fase 5 — persistencia de partida** | ⏳ Pendiente | Cerebro, genoma y vocabulario se serializan por separado; motor y mundo no, y no hay guardado/carga coordinado en UI/IndexedDB. |

## Mundo implementado en esta rama

`src/world/` asocia `descansar` y `acurrucarse` al nido; `buscar` al comedero; `explorar` a la pelota; y `observar` a la luz suave. Los objetos imponen un tiempo de recuperación determinista. Si están listos, devuelven impulsos; `BiochemEngine.applyImpulse()` valida todo el lote antes de aplicar cambios y recorta drives/químicos a sus rangos.

La app mantiene cada decisión durante **0,75 segundos simulados**. El refuerzo automático compara el malestar al cerrar ese intervalo con el baseline anterior, para que el resultado de la acción pueda afectar la señal. **No es todavía aprendizaje de navegación:** los objetos no tienen coordenadas y el agente no camina hacia ellos. La UI ofrece **Probar acción** para verificar el efecto individual de cada verbo; esa intervención no se acredita al cerebro.

## Qué está validado y qué no

- Tests sintéticos cubren determinismo, aprendizaje de una acción objetivo, refuerzo negativo y reversión de preferencia.
- Los tests del mundo comprueban que cada verbo produce el objeto/impulso esperado, que los enfriamientos usan tiempo simulado y que buscar comida puede reducir el malestar.
- **No se afirma que se cumpla el hito «buscar comida en <5 min»**: todavía falta navegación, objetos espaciales y un protocolo A/B de juego real.
- El panel básico de actividad cerebral está en `main.ts`. El puerto de debug D2 existe, pero no hay un módulo de visualización L2 independiente en `src/render/`.

## Decisiones todavía abiertas

1. Ratificar el codebook de acción escalar o acordar one-hot. El primer corte del mundo usa los IDs de acción actuales.
2. Confirmar los mapeos provisionales de cuatro genes de entrada y tres químicos de estímulo.
3. Definir si/how el vocabulario se codifica en `BrainInputs`; no se añade un puente implícito.
4. Calibrar efectos/cooldowns y decidir movimiento, posición y alcance de las interacciones.

Son decisiones de diseño pendientes; no hay PR abierto que esté esperando su aprobación.

## Verificación local

```bash
npm ci
npm run typecheck
npm test
npm run build
```

En esta rama: **30 archivos de tests / 223 tests** pasan en la última ejecución. El workflow `.github/workflows/ci.yml` repite typecheck, tests y build en cada push y pull request.

## Siguientes pasos recomendados

1. Añadir posición/movimiento y render de objetos para que el verbo provoque una interacción espacial real.
2. Definir pruebas A/B y criterios de aprendizaje autónomo antes de anunciar el hito de comida.
3. Serializar el estado del motor/mundo y coordinar guardado/carga de toda la partida.
4. Resolver las decisiones de mapeo anteriores con las personas responsables antes de cambiar contratos.
