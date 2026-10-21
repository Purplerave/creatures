# Hoja de ruta del producto

**Actualizada:** 21 de octubre de 2026  
**Base técnica:** fases 0–5, mundo espacial, genoma F2/F4, cerebro v0.5, vocabulario y persistencia descritos en [README](../README.md).  
**Objetivo de esta hoja:** priorizar experiencia, evidencia y fiabilidad antes de ampliar el alcance de la simulación.

## Principio de producto

Nilo debe ser interesante de observar y fácil de entender sin que el usuario tenga que estudiar una gráfica neuronal. Las herramientas de cerebro, genoma y bioquímica explican el comportamiento, pero el éxito del producto se mide por lo que la persona puede hacer y comprender en el hábitat.

El vocabulario actual es asociativo y expresivo; permanece desacoplado de las entradas del cerebro, conforme a la decisión de [Revisiones](REVISIONES.md).

## Prioridades

### P0 — Hacer legible el bucle de juego

**Resultado:** una persona que abre la demo entiende qué necesita Nilo, qué eligió hacer y qué consecuencia tuvo.

- Presentar de forma clara el estado de Nilo y su necesidad más urgente.
- Diferenciar acciones autónomas, órdenes por clic, pruebas manuales y refuerzos.
- Registrar la cadena percepción → decisión → acción → consecuencia → recompensa.
- Mantener un flujo guiado de cinco minutos que no exija conocimientos del panel técnico.

**Aceptación:** al menos 4 de 5 personas que prueben la demo sin explicación identifican una necesidad, dejan actuar a Nilo y describen correctamente el resultado de una interacción.

### P0 — Validar el aprendizaje más allá de un escenario

**Resultado:** la evidencia de mejora no depende de una sola semilla ni de un mapa preparado.

- Crear escenarios reproducibles con posiciones iniciales y niveles de drives variados.
- Comparar el cerebro con refuerzo contra control sin refuerzo y políticas base sencillas.
- Medir alimento consumido, tiempo hasta interacción, variación de malestar, acciones inútiles y exploración.
- Publicar resultados agregados y conservar escenarios no usados durante el ajuste.

**Aceptación:** el resultado se reproduce en varias semillas y escenarios; se informan también los casos donde el aprendizaje no mejora la conducta.

### P1 — Robustecer el reloj y el guardado

**Resultado:** la simulación conserva su comportamiento al cambiar velocidad, FPS o al restaurar una partida.

- Separar paso fijo de simulación y frecuencia de renderizado.
- Definir pausa, aceleración, pestaña inactiva y tiempo transcurrido.
- Cubrir el ciclo navegador: jugar, guardar, recargar y recuperar cerebro, mundo y drives.
- Mantener migraciones explícitas y mensajes claros al importar datos inválidos.

**Aceptación:** una misma duración simulada produce resultados equivalentes con distintos ritmos de render; un guardado restaurado continúa de forma reproducible.

### P1 — Hacer accesibles los controles del hábitat

**Resultado:** las funciones principales se pueden usar sin ratón y el canvas tiene una alternativa comprensible.

- Añadir controles de teclado con foco visible y una lista DOM de objetos y acciones.
- Etiquetar drives, estados y decisiones para tecnologías de asistencia.
- Respetar movimiento reducido y revisar contraste en ambos temas.
- Probar diseño táctil y tamaños de pantalla estrechos.

**Aceptación:** se puede observar el estado e interactuar con objetos usando solo teclado; el canvas no es la única fuente de información.

### P1 — Cerrar preparación para publicación

**Resultado:** quien visita el repositorio sabe qué puede usar, cómo probarlo y cómo contribuir.

- Elegir licencia y documentar procedencia de código, referencias y assets.
- Añadir demo/capturas, descripción y temas del repositorio.
- Mantener las instrucciones de instalación y CI sincronizadas.
- Crear issues pequeños a partir de hitos con criterios de aceptación.

**Aceptación:** una persona nueva puede ejecutar la demo siguiendo README y entender el permiso de reutilización sin inferencias.

### P2 — Ampliar mundo y genética con propósito

Empezar solo cuando el bucle de una criatura y su evaluación sean sólidos.

- Probar múltiples criaturas y habitaciones con métricas de rendimiento.
- Definir ecología, reposición de recursos y convivencia antes de multiplicar objetos.
- Diferenciar herencia y mezcla genética de evolución poblacional; usar «evolución» solo con selección y diversidad medibles.
- Posponer compatibilidad con formatos clásicos hasta que exista un objetivo de producto que la justifique.

## Decisiones de diseño vigentes

- El contrato conserva el codebook escalar de acciones.
- El vocabulario es una capa asociativa expresiva y no alimenta el cerebro.
- La licencia sigue pendiente de decisión del propietario.
- Las métricas de aprendizaje deben reportar límites y controles; el éxito en un test aislado no implica inteligencia general.

## Cadencia de revisión

Revisar esta hoja cuando se complete un hito P0/P1 o cambie una decisión de producto. Actualizar el README y [docs/REVISIONES.md](REVISIONES.md) en el mismo cambio que altera una decisión; evitar mantener estados contradictorios.
