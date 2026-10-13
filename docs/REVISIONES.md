# Revisiones, coordinación y decisiones abiertas

**Actualizado:** 13-oct-2026. La coordinación del repo se realiza en GitHub; el pad de ScratchThePad no es escribible para agentes.

## Integraciones verificadas en GitHub

- **D1 — adaptador del cerebro:** aprobado e integrado. `BrainV05Adapter implements IBrain`; conserva una superficie pequeña y encierra el modelo.
- **L1 — visuales Canvas:** aprobado e integrado. `CanvasVisuals`, `deriveMood()` y pruebas visuales.
- **Fase 3 — cerebro real v0.5:** PR [#3](https://github.com/Purplerave/creatures/pull/3), fusionado. `BrainV05` implementa el MLP, ε-greedy, aprendizaje por recompensa y el panel básico.
- **D2 — puerto de debug:** PR [#4](https://github.com/Purplerave/creatures/pull/4), fusionado. El adaptador ofrece el estado de depuración acotado. La vista L2 independiente (`src/render/brain-view.ts`) no está en este repo.

GitHub consultado el 13-oct-2026: PRs #1–#4 están fusionados, **ningún PR abierto**, **ningún issue abierto** y la última CI visible sobre `main` está en verde ([run 38292996496](https://github.com/Purplerave/creatures/actions/runs/38292996496)). La hoja de ruta se mantiene en [`ESTADO-PROYECTO.md`](ESTADO-PROYECTO.md), no en tickets abiertos.

## Trabajo local de esta rama

`arena/4651a715-creatures` añade un primer mundo por eventos en `src/world/`:

- Cuatro objetos (nido, comedero, pelota, luz suave) y cinco verbos del codebook.
- Enfriamientos medidos en tiempo simulado.
- `BiochemEngine.applyImpulse()` valida todos los deltas antes de mutar estado y los limita a los clamps.
- Una decisión se mantiene 0,75 s; el refuerzo automático evalúa el efecto al final del intervalo.
- La UI permite ejecutar manualmente un verbo para comprobar su consecuencia sin atribuir esa intervención al cerebro.
- Añade `CONTRIBUTING.md` y plantillas GitHub de bug, mejora y PR para que el trabajo futuro tenga pasos reproducibles.

Este cambio local aún no se ha subido ni tiene PR/CI remota. No cambia el contrato escalar aprobado ni afirma completar Fase 4: el mundo aún no tiene movimiento, posiciones, colisiones ni navegación. No se añade licencia sin que la persona propietaria elija una.

## Decisiones abiertas (diseño, no revisiones bloqueantes)

1. Confirmar si el transporte escalar de acciones se conserva o si se prefiere one-hot. El prototipo actual conserva el contrato aprobado.
2. Confirmar los cuatro genes de entrada (`alerta`, `sociabilidad`, `resiliencia`, `metabolismo`) y los estímulos (`dopamina`, `cortisol`, `adenosina`), todavía provisionales.
3. Decidir si el vocabulario alimentará los tres canales de estímulo de `BrainInputs` y con qué codificación.
4. Calibrar las magnitudes/cooldowns del mundo y concretar un criterio de aprendizaje autónomo reproducible.
5. Definir persistencia coordinada de cerebro, genoma, vocabulario, motor y mundo.

No se deben cambiar contratos ya aprobados unilateralmente. Mientras se resuelven estas decisiones, los valores actuales se identifican como provisionales y el trabajo no las presenta como decisiones ratificadas.

## Verificación

En esta rama, la validación local actual es `npm run typecheck`, `npm test` (**30 archivos / 223 tests**) y `npm run build`. Para aceptar una futura integración, repetir los tres comandos y comprobar la app manualmente con las instrucciones de [`../README.md`](../README.md).
