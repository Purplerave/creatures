# Creatures 🧬 — una mascota digital con cerebro

Proyecto de ocio inspirado en *Creatures* (1996): una criatura virtual con necesidades, aprendizaje y una apariencia que reacciona a su estado. La criatura actual se llama Nilo.

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

## Probar la demo

1. Mira el panel **Objetos del mundo**: Nilo elige una acción cada 0,75 segundos simulados. Descansar/acurrucarse usan el nido; observar usa la luz; explorar usa la pelota; buscar estímulo usa el comedero. Las tarjetas muestran el estado de recuperación y cuántas veces se ha usado cada objeto.
2. Para probar un resultado concreto, elige un verbo en **Probar un verbo sin entrenar el cerebro** y pulsa **Probar acción**. Comprueba cómo cambian los drives. Esta intervención es manual: no se atribuye como recompensa a la decisión anterior del cerebro.
3. En **Cerebro de Nilo**, pulsa **Premiar** o **Castigar** para reforzar la última decisión. Las probabilidades y el contador se actualizan en el panel. El interruptor de refuerzo automático permite comparar el aprendizaje con/sin la recompensa por reducción de malestar.
4. En **Vocabulario**, enseña una palabra asociada a comida, pelota o luz suave; repítela para aumentar confianza y deja pasar tiempo simulado para observar el olvido.

Las interacciones manuales de prueba permiten validar cada objeto al instante; el comportamiento autónomo sigue siendo una demo experimental, no una afirmación de que Nilo ya haya aprendido la tarea de buscar comida.

## Estado actual

El scaffold TypeScript/Vite incluye un motor determinista con ocho drives y seis químicos, visuales Canvas, genoma con mutación determinista, vocabulario con olvido y `BrainV05`: un MLP de 15 entradas, capa oculta `tanh`, cinco acciones ε-greedy y aprendizaje Hebbiano modulado por recompensa.

Esta rama añade el primer corte de **Fase 4** (`src/world/`): cuatro objetos con recuperación, un mapeo explícito de los cinco verbos a objetos e impulsos bioquímicos atómicos (`BiochemEngine.applyImpulse`). La recompensa automática compara el malestar antes y después de cada acción, no cada fotograma.

**Alcance que todavía falta:** este mundo es de eventos; Nilo aún no se desplaza, no hay colisiones ni habitaciones y los efectos son valores iniciales por calibrar. Tampoco existe guardado/carga integrado de la partida. El motor bioquímico y el mundo no tienen aún una serialización coordinada.

Siguen abiertas decisiones de diseño: si conservar el codebook escalar o adoptar one-hot, confirmar los mapeos provisionales de genes y químicos de entrada, y acordar cómo (o si) las palabras aprendidas alimentarán `BrainInputs`. El aprendizaje del cerebro está validado en tests sintéticos; el hito de aprender a buscar comida en una partida real depende de ampliar el mundo y calibrar el refuerzo.

## Estructura

- `src/biochem/` — motor determinista, tabla de drives, químicos, reacciones e impulsos de eventos.
- `src/contracts/` — interfaces compartidas entre simulación y módulos.
- `src/visuals/canvasVisuals.ts` — implementación Canvas de `IVisuals`.
- `src/brain/` — adaptador, runtime, MLP v0.5, acciones y recompensa.
- `src/world/` — mundo mínimo por eventos, objetos y efectos de acciones.
- `src/genome/` y `src/vocab/` — genoma determinista y vocabulario con olvido.
- `src/main.ts` — bucle principal, interfaz, decisiones y coordinación de módulos.
- `tests/` — pruebas Vitest del motor, genoma, cerebro, vocabulario, mundo, visuales y app smoke.
- `docs/ESTADO-PROYECTO.md` — estado detallado, auditoría de GitHub y próximos pasos.
- `docs/CEREBRO.md`, `docs/GENOME.md`, `docs/VOCAB.md` — diseños y fórmulas de los módulos.
- `bichito.html`, `estudio-proyecto-creatures.html`, `report.md`, `notes/` — prototipo, investigación y hoja de ruta.

## Contribuir

Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md) para las verificaciones y las reglas de contratos. GitHub tiene plantillas para reportar bugs, proponer mejoras y revisar pull requests. El repositorio aún no declara una licencia; no asumas permisos de reutilización.

## Próximos pasos

1. Dar posición y movimiento a Nilo y a los objetos; convertir las interacciones en eventos espaciales y calibrar una prueba A/B reproducible.
2. Añadir serialización del motor y del mundo, y coordinarlas con cerebro/genoma/vocabulario desde la UI (exportar/importar y guardado local).
3. Resolver los mapeos provisionales de genes, estímulos y vocabulario, sin cambiar unilateralmente contratos aprobados.
4. Completar criterios de éxito para el aprendizaje autónomo con comida, juego y confort.
