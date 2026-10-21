# Revisión externa intensiva del repositorio `creatures`

**Fecha:** 21-oct-2026 · **Rama revisada:** `arena/3644da34-creatures` (base `main` @ `88b16a0`) · **Revisión:** lectura completa de `src/` (7 766 líneas), `tests/` (3 714), `docs/` + README/LEEME/CONTRIBUTING (1 841), ejecución de verificaciones y dos sondas empíricas.

---

## 0. Qué hice para poder opinar

| Verificación | Resultado |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` (`tsc --noEmit`, `strict: true`) | **0 errores** |
| `npm test` (Vitest) | **36 suites / 248 tests en verde**, 8,24 s |
| `npm run build` (Vite) | OK → `dist/index.html` 37,72 kB + JS 103,25 kB (gzip 31,6 kB), 33 módulos |
| Sonda sobre `BrainV05Adapter.getDebugState()` con `BrainV05` real | filtra `hiddenActivations` (12 valores) y `outputWeights` (60 valores) |
| Sonda sobre `mutateStructural()` + knobs cerebrales | fenotipo pasa a `hiddenSize 44`, el cerebro vivo sigue en `34` |
| Barrido de 12 semillas del protocolo A/B de `tests/spatial-world.test.ts` | **10/12 cumplen** las cuatro afirmaciones; 2/12 fallan |
| Lectura cruzada de `docs/*` contra código | 6 contradicciones documentadas abajo |

No probé manualmente la app en un navegador real (barrido de teclado, ratón y guardado/recarga en vivo); todo lo relativo a UI es lectura de código, no observación de ejecución.

---

## 1. Opinión general

**Es un repositorio notablemente mejor acabado que la media de proyecto de afición, y el problema principal no es el código: es la distancia entre lo que el código hace y lo que la documentación dice que hace.**

Lo mejor del repo es el núcleo. `BiochemEngine`, `Genome`, `BrainV05`, `Vocabulary` y `CreatureWorld` comparten una disciplina rara y muy valiosa: determinismo explícito (cero `Math.random()`, PRNG con semilla y contador de extracciones serializado), validación defensiva en todas las fronteras (`RangeError` con mensaje accionable, lotes atómicos, cuarentena todo-o-nada en `restoreGameState`), y serialización estable byte a byte. Esos no son detalles decorativos: son la base de que los tests de reproducibilidad signifiquen algo. Los contratos en `src/contracts/` están bien pensados y, sobre todo, **bien defendidos por tests** (`adapter-interface.test.ts` fija la superficie de `IBrain`, `extensibility.test.ts` fija que añadir un drive no toca el motor).

La arquitectura de puertos (bioquímica como única autoridad del estado; el mundo devuelve `BiochemicalImpulse` y nunca toca drives; el render es solo lectura) es correcta y está respetada en el 90 % del código. Los tests son sustantivos, no decorativos: miden propiedades (determinismo, monotonicidad, clamp, roundtrip) en lugar de snapshots de comportamiento accidental. `tests/spatial-world.test.ts` es un A/B real con control, métricas y reproducibilidad. La accesibilidad de la UI (roles `meter`, `aria-valuenow` actualizado, `role="status"`/`aria-live`, tarjetas de objeto activables con Enter/Espacio, `prefers-reduced-motion`) está por encima de lo esperable.

Y aun así, revisado a fondo, el repo arrastra tres clases de deuda —funcional, de evidencia y de proceso— que conviene atacar ya, porque **se multiplican con cada fase nueva**:

1. **El genoma no reconfigura el cerebro en vivo.** La mutación F2 y la metilación cambian el fenotipo, y la UI muestra el valor nuevo, pero la red real no se reconstruye. Es una función visible que miente.
2. **La documentación y los comentarios están desincronizados del código en puntos que son justamente las reglas de diseño del proyecto** (el puerto D2, el olvido del vocabulario, qué módulos existen). En un repo donde las decisiones de diseño viven en prosa, esto es lo más peligroso que hay.
3. **La afirmación estrella de aprendizaje es más frágil de lo que el README sugiere**: se sostiene en 10 de 12 semillas y la métrica principal (`P(buscar | hambre)`) está saturada, así que no mide lo que cree medir.

Nada de esto es un defecto de programación: el código está limpio, tipado y coherente. Es un problema de **verificación y de proceso de revisión**, y es coherente con cómo se construye el repo (nueve PRs en nueve días, casi todos generados por agentes y fundidos con validaciones del tipo «no pude ejecutar la app en este entorno», con docs de estado escritas por el mismo agente que escribió el código). Eso se trata en §4 y es, en mi opinión, la palanca de mayor retorno de todo el documento.

---

## 2. Hallazgos por severidad

### B1 · Alta — Genotipo → cerebro solo se aplica al nacer (función visible incorrecta)

`createBrainRuntime()` deriva `hiddenSize`/`learningRate`/`epsilonInitial` del fenotipo y se pasan al constructor de `BrainV05`. Después, `onMutateGenomeClick()` (`src/main.ts:861`) y el botón de metilación llaman a `engine.setPhenotype(...)` — que sí re-aplica los deltas de decay de forma atómica — pero **no re-construyen el cerebro**.

Sonda empírica (semilla 5, 30 pasadas de `mutateStructural(seed, 0.9)`):

```text
phenotype.brain antes    = {"hiddenSize":34,"epsilonInitial":0.325,"learningRate":0.155}
brain.config antes       = {"hiddenSize":34,...}
phenotype.brain después  = {"hiddenSize":44,"epsilonInitial":0.325,"learningRate":0.1709}
brain.config después     = {"hiddenSize":34,...}   ← el cerebro vivo no se enteró
```

Consecuencias observables: `renderGenomePanel()` muestra «44 ocultas» (usa `currentPhenotype.brain.hiddenSize`) mientras `BrainView` dibuja 34 neuronas; mutar «capacidad» o metilarla no cambia el aprendizaje; y el guardado persiste una topología que ya no concuerda con el genoma (`BrainV05.deserialize` lanza `hiddenSize incompatible` si se intenta cargar con el fenotipo nuevo, lo que hace que este estado sea **incargable en ciertas combinaciones**).

Opciones: (a) re-crear el cerebro en caliente preservando pesos por recorte/propagación y documentar la semántica; (b) declarar formalmente que los knobs cerebrales son de desarrollo (*developmental knobs*, se fijan al incubar) y reflejarlo en la UI («solo afecta a la próxima cría») y en `docs/GENOME.md`. **La (b) es barata y honesta; la (a) es lo que el usuario espera.** Hoy está en el peor punto intermedio: promete (a) y hace (b) sin decirlo.

### B2 · Alta — Contaminación de la señal de aprendizaje por atribución de origen

`src/main.ts` guarda **un único** `lastWorldSource: 'brain' | 'manual'` global (línea 396, se pisa en 732), y el bucle lo consulta cuando una interacción diferida se dispara al llegar al objeto (`src/main.ts:1121`):

```ts
const interactionSource = lastWorldSource;   // estado global, no propiedad de la acción pendiente
...
if (interactionSource === 'manual') { suppressNextAutoReward = true; ... }
```

Con «Exigir cercanía» activo, el orden normal es: el usuario ordena una acción manual → Nilo camina → **en medio, el cerebro toma una decisión** (y pisa `lastWorldSource = 'brain'`) → al llegar se dispara la interacción manual pendiente → su consecuencia bioquímica se atribuye a la última decisión del cerebro, que no la causó. El `reinforce()` siguiente refuerza una acción con un premio ganado por otra. El mecanismo que pretendía proteger el aprendizaje (la supresión) depende de un flag global que cualquier decisión intermedia invalida.

El arreglo es mover el origen al propio mundo: `pendingActionSource` junto a `pendingActionId`, propagarlo en `WorldActionResult`/`triggeredInteraction` y que `main.ts` solo lea ese valor. Es un cambio pequeño, con test en `tests/spatial-world.test.ts` (secuencia: orden manual diferida → decisión cerebral → llegada ⇒ no debe incrementar refuerzos).

### B3 · Media — La reanudación «bit a bit» tras cargar no es tal en la app

Los módulos sí continúan idénticos (lo prueba `tests/persistence-coordinator.test.ts`), pero `applyRestoredSession()` (`src/main.ts:816`) añade un `brain.think()` extra para pintar el panel (`src/main.ts:849`):

```ts
if (!brain.getDebugState().hasThink) {
  lastBrainOutput = brain.think(brainInputs(snap, frame));
}
```

Ese `think()` consume dos extracciones del PRNG, decae ε y deja un `lastThink` **que nunca se ejecuta en el mundo**. Por tanto: (1) la trayectoria posterior difiere de la partida original a partir del primer `reinforce`; (2) el primer refuerzo automático post-carga atribuye el cambio de malestar del intervalo anterior a una decisión inventada por la propia carga. La documentación (`docs/ESTADO-PROYECTO.md`: «igualdad bit a bit de trayectorias posteriores a `restoreGameState()`») describe la garantía de los módulos, pero el lector la aplicará a la partida, que es donde falla.

Arreglo: un método de solo lectura en el adaptador para pintar (o `peek` del último `think` serializado) sin llamar a `think()`; y separar la recompensa del primer intervalo tras restaurar (`suppressNextAutoReward = true` ya existe, pero no cubre el `lastThink` fantasma).

### B4 · Media — El refuerzo de lectura (`engine.tick(0)`) muta el snapshot guardado

`tick(0)` no avanza nivel, pero **sí reescribe `target`** (`slot.target = clamp(level + rate)`), y `target` viaja en `serialize()`. `manualReinforce()` (`src/main.ts:790`), `performWorldAction()` (743), `applyRestoredSession()` (846) y el bucle (1130, 1166) llaman a `engine.tick(0)` para «leer» → la UI muta estado persistible y dos guardados del mismo instante pueden diferir. Además `getDrive()` ya devuelve copias, así que un `snapshotReadonly()` explícito eliminaría la necesidad de `tick(0)`.

### B5 · Media — La evidencia de aprendizaje es más débil que su redacción

`tests/spatial-world.test.ts` fija «el agente reforzado acude sustancialmente más al comedero y eleva `P(buscar | hambre)` en > +25 puntos». Repitiendo el protocolo exacto sobre 12 semillas:

```text
seed 20261021 | A uses= 77 P(buscar)=1.000 malestar=0.197 → 0.143 || B uses=  2 P=0.203 | CUMPLE
seed       1  | A uses= 50 P(buscar)=1.000                    || B uses=  3 P=0.159 | CUMPLE
seed       2  | A uses= 69 P(buscar)=1.000                    || B uses=  6 P=0.197 | CUMPLE
seed       3  | A uses= 75 P(buscar)=1.000                    || B uses=  3 P=0.222 | CUMPLE
seed       7  | A uses= 64 P(buscar)=1.000                    || B uses=  2 P=0.136 | CUMPLE
seed      11  | A uses= 71 P(buscar)=1.000                    || B uses=  5 P=0.161 | CUMPLE
seed      42  | A uses= 73 P(buscar)=1.000                    || B uses=  8 P=0.154 | CUMPLE
seed     101  | A uses= 31 P(buscar)=1.000 malestar=0.349    || B uses= 68 P=0.246 malestar=0.217 | FALLA
seed     777  | A uses= 55 P(buscar)=1.000                    || B uses=  3 P=0.207 | CUMPLE
seed    2026  | A uses= 83 P(buscar)=1.000 malestar=0.194 → 0.143 || B uses= 83 P=0.293 malestar=0.194 → 0.143 | FALLA
seed   31337  | A uses= 71 P(buscar)=1.000                    || B uses=  3 P=0.199 | CUMPLE
seed  999999  | A uses= 74 P(buscar)=1.000                    || B uses=  7 P=0.196 | CUMPLE
→ 10/12 cumplen las cuatro afirmaciones simultáneamente
```

Lectura:

- **1/6 semillas el control rinde igual o mejor.** Con pesos iniciales aleatorios que ya favorecen `buscar`, el control hace 83 usos y malestar idéntico al experimental: en ese caso el test no demuestra nada sobre aprendizaje.
- **`P(buscar | hambre) = 1.000` en el grupo experimental en las 12 semillas.** El softmax satura, el margen «> +25 puntos» se cumple siempre y la métrica no informa. Mejor reportar el logit, la entropía de la política o `P` antes del `argmax` con ε (o medir «usos del comedero por hora bajo hambre»).
- **El control es un espantapájaros por construcción.** `epsilonDecay = 0.985` por decisión y `epsilonFloor = 0.04`: tras ~90 decisiones (240 s / 2,6 s), el control está prácticamente congelado en su sesgo inicial y no puede recuperarse. Un control justo sería greedy con el mismo ε-floor (sin gradiente) o una política fija `descansar`.
- El entorno añade presión metabólica artificial paso a paso (`applyImpulse({ hambre: +0.0025, glucosa: −0.003 })`) y `gain = 10` en vez del `DEFAULT_REWARD_GAIN = 6`: la tarea está empujada a ser resoluble.

Esto **ya está reconocido** en `docs/ROADMAP.md` (P0 «Validar el aprendizaje más allá de un escenario»), lo cual es de agradecer; el problema es que README y `docs/ESTADO-PROYECTO.md` enuncian el resultado en absoluto («demuestra aprendizaje autónomo de comida en < 5 minutos simulados») sin el «en la semilla del test». Sugerencia: convertir el barrido en test (varias semillas, informar los fallos explícitamente) y alinear el enunciado del README con lo que el test sostiene. Nota positiva: el control de reproducibilidad (`expect(groupALearned).toEqual(groupALearnedRepeat)`) es exactamente el test correcto.

### B6 · Media — Drift documental en las propias reglas de arquitectura

Seis contradicciones concretas, todas verificables:

1. **`src/brain/adapter.ts:153-156` y `src/brain/brainv05-types.ts:39 y 49`** afirman que `hiddenActivations`/`outputWeights` quedan a `[]` porque «`BrainV05` no los incluye». **Falso**: la sonda devuelve 12 y 60 valores reales desde el primer `think()`.
2. **`docs/ADAPTER.md` se contradice a sí misma**: la tabla de campos dice «✅ real en `BrainV05`» y tres líneas después, la regla 3 dice «hoy `BrainV05` no los incluye → `[]`». La segunda versión es la que se copió a los comentarios del código.
3. **La regla 4 del mismo documento** («excepción acotada: no expone capas ni arquitectura») ya no es cierta en espíritu: por D2 salen la matriz completa de pesos de la capa de salida y las activaciones ocultas. Decisión honesta a tomar: o se actualiza la excepción («D2 expone topología y pesos de lectura para depuración, y solo para eso»), o el adaptador filtra. Lo que no vale es el estado actual: una regla escrita antes de implementar lo que luego se implementó, sin nadie que la contrastara.
4. **`src/main.ts` alimenta `BrainView` saltándose D2.** La vista se construye con `{ getDebugState: () => brain.getDebugState() }` (adaptador), pero `renderSnapshot()` inyecta `modelDebug = brainModel.getDebugState()` (`src/main.ts:589`, el MLP crudo) para probabilidades y ε. README y `docs/ESTADO-PROYECTO.md` dicen «consumiendo **exclusivamente** el puerto D2». Es la regla central del módulo y está rota en el cableado, aunque sea UI.
5. **`docs/INTEGRACION-RUNTIME.md:34`**: «el módulo independiente de render de depuración L2 (`src/render/brain-view.ts`) no está presente en este checkout». Está presente desde PR #6.
6. **README y `docs/ESTADO-PROYECTO.md` hablan de «olvido exponencial»** del vocabulario. `src/vocab/vocabulary.ts` implementa decaimiento **lineal** (`confidence −= decayPerSecond · dt`) y `src/contracts/ivocab.ts` lo documenta como lineal. Sonda: `0.95 0.90 0.85 0.80 0.75 …` — recta perfecta. El contrato tiene razón; la capa de resumen, no.

Además: `report.md` (138 líneas), `estudio-creatures-revision.md`, `estudio-proyecto-creatures.html` y `bichito.html` conviven en la raíz sin enlazar entre sí; `docs/L1-PORT-VISUAL.md` es un brief histórico ya implementado. Ver §4 sobre por qué esto importa en un repo de agentes.

### B7 · Baja — Roce de robustez y consistencia

- `Genome` acepta ids de gen **desconocidos** en `config.genes` (y por tanto en un JSON importado) y los trata como genes válidos de rango `[0,1]`, mientras `setMethylation()` los rechaza con `RangeError`. Asimetría de validación en la frontera de importación.
- `BrainV05.dispose()` deja pesos a cero y **`serialize()` sigue funcionando**, así que un guardado posterior a un dispose produce una partida de ceros en lugar de fallar. `serialize()` debería lanzar si `disposed`.
- `BrainV05.deserialize()` valida la **longitud** del espacio de acciones pero no reemplaza `this.actions`: si el JSON trae los mismos ids en otro orden o con otros códigos, la carga se acepta y la decodificación posterior usa el catálogo viejo.
- `actions.ts` obliga a códigos únicos con tolerancia `1e-9` — bien; pero `actionFromValue` hace búsqueda lineal y se llama varias veces por fotograma. Nada crítico a 5 acciones, sí un recordatorio de que el codebook escalar (-1, -0.5, 0, 0.5, 1) es un mapeo frágil «por contrato»: si alguien añade un verbo con valor 0.499 el sistema se degrada en silencio. Un `actionId` explícito en `debug` (ya se puede) y que `main.ts` lea **siempre** por id, no por valor, eliminaría la clase entera de errores.
- `resolveLifeStage()` codifica «1 día simulado = 60 s» y umbrales 20/90/240 a pelo en `saveCoordinator.ts`, mientras la ontogenia de los genes usa `switchOnTime` en segundos. Dos relojes de desarrollo sin relación declarada.
- La `CODON_TABLE` NCBI es **correcta** pero se construye con un truco ininteligible: `'LLLLPPPPHHQRRRRR'.replace('RRRRR','QRRRR')` para fabricar `...HHQQRRRR`. El resultado verifica contra la tabla 1 de NCBI; el mantenimiento, no. Escribir la cadena literal de 64 caracteres y un test de igualdad contra el orden `TCAG×TCAG×TCAG` cuesta lo mismo y es legible.
- `docs/ADAPTER.md` muestra `new BrainView(brain)` cuando la firma real es `new BrainView({ getDebugState })`. Funciona por suerte estructural; conviene que el ejemplo sea el código real.

### B8 · Baja — Rendimiento y UI

- `BrainView.render()` llama a `readPalette()` (`src/render/brain-view.ts:216`) → `getComputedStyle(document.documentElement)` **en cada fotograma** (60-70 lecturas/s). Se cachea una vez y se invalida en `resize`/cambio de tema y listo.
- `main.ts` reescribe texto y estilos de 8 medidores de drives + 6 químicos en cada fotograma aunque el valor no cambie; con `timeScale = 8` el coste crece. Un cache por valor redondeado lo recorta a casi cero.
- `renderGenomePanel()` reconstruye el DOM de genes en cada mutación/metilación (correcto, pero `replaceChildren()` + listeners inline se acumulan si se llamara por frame; hoy no es el caso).
- `index.html` son 1 052 líneas con todo el CSS en línea. Comprensible para «un archivo, sin build», pero es el único sitio donde nadie va a revisar contraste o focus-visible: sacarlo a `src/styles.css` con el pipeline Vite existente cuesta minutos.

---

## 3. Qué está especialmente bien (para que no se rompa al crecer)

- **`BiochemEngine`**: orden de fases documentado (reacciones → decaimiento → drives), integración exponencial exacta de primer orden en las reacciones, impulsos atómicos con validación previa sin escritura parcial, `setPhenotype()` que re-aplica multiplicadores sobre `baseDecayPerSecond` **sin perder los niveles vivos** — un detalle de diseño fino que delata buen gusto.
- **Extensibilidad real, no declarada**: `registerDrive`/`registerChemical` con snapshot en el constructor y test que lo demuestra (`extensibility.test.ts`).
- **`BrainV05`**: la regla Hebbiana encadenada (`Δw1` con `w2` **antes** de actualizar `w2`) está bien implementada, el orden de operaciones en `reinforce()` es el correcto, la inicialización Xavier-ish con semilla y el `draws` serializado para reproducir el azar son decisiones maduras.
- **`CreatureWorld`**: cinemática sin sobrepaso con `step = min(remaining, speed·dt)`, disparo de la acción en el instante de entrar en radio, `hitTestObject` con tolerancia derivada del radio, migración de esquema v1→v2 explícita y validada (`manualTargetPosition` ausente ⇒ error explícito).
- **`saveCoordinator.restoreGameState()`**: cuarentena honesta, y el `dispose()` del cerebro provisional **solo en la rama de error**, con `brainModel.dispose()` en el `catch` para no fugarse. Además valida `saveVersion`, tipos de metadatos, longitud de nombre y tamaño de importación (5 MiB).
- **Tests de contrato de superficie** (`adapter-interface.test.ts`) como seguro anti-regresión de arquitectura: poco común y muy rentable.
- **CI**: `npm ci` → typecheck → tests → build, con `permissions: contents: read` y Node 22. Correcta y mínima.

---

## 4. Proceso: el riesgo estructural del repo

Contexto que me pareció relevante (visible en GitHub): 9 PRs entre el 12 y el 21 de octubre, casi todos desde ramas `arena/*` y `codex/*`; **PR #6 = 4 792 líneas añadidas** (L2 + Fase 4 + F2/F4 del genoma + Fase 5 de persistencia **en un solo PR**, fundido); PR #7 y #9 con validación declarada como «*this environment could not run the app locally*» / «*no local checkout is available in this session*».

Sin ánimo de culpar a nadie: **así es exactamente como se produce el drift que documenté arriba.** El mismo agente implementa, redacta la tabla de «estado del proyecto» con ✅, y luego describe el resultado en prosa; nobody verifica la prosa contra el código, y el siguiente agente toma esa prosa como verdad. Todos los casos de B1, B2 y B6 son de ese tipo: el código cambió y la afirmación quedó atrás, o la afirmación se escribió pensando en un diseño anterior.

Recomendaciones concretas y baratas:

1. **Tamaño de PR**: un límite explícito en `CONTRIBUTING.md` (p. ej. «no mezcles más de un módulo de contrato en un PR») y dividir tipo PR #6 en cuatro. Con 4 792 líneas, ni un humano ni un modelo revisan bien.
2. **Que CI escriba el estado, no que los agentes lo narren.** Un job que ejecute `npm test -- --reporter=json` y falte si el número de suites/tests difiere del anunciado; o, mejor, **dejar de citar «36 suites / 248 tests»** en README, `docs/ESTADO-PROYECTO.md` y `docs/REVISIONES.md`. Es información que caduca en el PR siguiente y ya caducó: tres docs distintas mantienen la misma cifra a mano.
3. **Un test de consistencia documental** (30 líneas): que falle si `docs/**` o JSDoc contienen «olvido exponencial» junto a `decayPerSecond` lineal, o si afirman que `src/render/` no existe. Suena a broma; es la familia de bugs más numerosa de este informe y es la que más barato se bloquea.
4. **Una verificación humana de la demo por hito**: `npm run dev`, cargar, mutar genoma, guardar, recargar, importar un JSON corrupto. Tres minutos, y habría cazado B1 y B6.4.
5. **Licencia y deudores de código**: sigue sin `LICENSE`, y el repo deriva visuales y lógica de `bichito.html` (prototipo propio) y se declara «inspirado en *Creatures* (1996)» con datos de dominio público de la tabla NCBI. Elegir licencia (MIT/Apache-2.0) y poner una nota de procedencia en `README` es un cierre barato de la P1 de vuestro roadmap.

---

## 5. Fondo del producto: mi opinión sobre la «criatura»

La simulación es seria; **la inteligencia todavía es delgada, y el cuello de botella no es el motor sino el espacio de representación**:

- El cerebro ve 15 escalares: 8 niveles de drive, 3 químicos y 4 genes. **No ve dónde está nada.** El mundo tiene posiciones 2D, radios, distancias y estados de enfriamiento —y ninguno de esos datos llega a `BrainInputs`. Con esa entrada, la política óptima no puede depender del espacio, así que el experimento A/B que «demuestra aprendizaje espacial» aprende en realidad un **bandido de 5 brazos con recompensa por reducción de drive** mientras el cuerpo camina hacia el objeto que el verbo ya eligió. Eso no es un defecto de implementación (`BrainInputs` es el contrato aprobado): es la decisión que limita el techo del proyecto.
- El mapeo verbo → objeto es **inyectivo** (`INTERACTIONS`: cada verbo tiene un único objeto). Con `descansar`/`acurrucarse` compartiendo `nido`, el cerebro elige un verbo y el mundo deduce el destinatario. No hay «atención» ni «sustantivo», que en el Creatures original (según vuestro propio `report.md`: Perception → Concept → Attention WTA → Decision WTA) era justo el corazón del sistema. Añadir *qué objeto atiende* al vector de entrada es la ampliación con más retorno por línea de código.
- 5 acciones sobre 4 objetos con cooldown es un espacio tan pequeño que `softmax` satura (ver B5: `P = 1.000`). La red de 15→20→5 no tiene apenas nada que aprender y la capa oculta es casi decorativa; en cambio, los 8 drives con acoplamientos químicos sí generan conducta interesante. **La riqueza hoy está en la fisiología, no en la red**, y el roadmap haría bien en decirlo.
- Buena noticia: los ingredientes del camino están plantados. `neuromodulatedReward()` (RPE tipo Schultz), instintos entendidos como «refuerzo simulado» (vuestro `docs/VISION-SUPER-BESTIA.md`), epigenética reversible y el protocolo A/B determinista son las cuatro piezas que faltan para que una criatura de 1 000 parámetros parezca viva. Yo priorizaría **percepción espacial + atención** antes que cualquier panel nuevo.

Un último comentario de producto, dicho con cariño: hay **seis sistemas completos y un solo usuario**. El roadmap P0 («4 de 5 personas que prueben la demo sin explicación entienden qué necesita Nilo») es la medida correcta y la más barata de todas. Nilo tiene 8 medidores, 6 químicos, 15 nodos neuronales, 9 genes, ORF con péptido, locus duplicados, metilación, vocabulario y 4 objetos: el panel técnico compite con la criatura por la atención de quien llega. La fase que más mejoraría el proyecto no es la Fase 6, es «ocultar la mitad y que la otra mitad se entienda sola».

---

## 6. Recomendaciones priorizadas

| # | Acción | Esfuerzo | Archivos |
|---|---|---|---|
| P0 | Decidir y aplicar semántica de knobs cerebrales: o re-crear el cerebro al mutar/metilar, o declararlo «de desarrollo» en UI y docs | 1–3 h | `src/main.ts`, `docs/GENOME.md`, test nuevo |
| P0 | Origen de la acción dentro del mundo (`pendingActionSource`) en lugar del flag global de `main.ts` | 1 h | `src/world/world.ts`, `src/main.ts`, `tests/spatial-world.test.ts` |
| P0 | Quitar el `think()` extra de `applyRestoredSession` (o aislarlo del reforzamiento) y ajustar el texto «bit a bit» | 30 min | `src/main.ts`, `docs/ESTADO-PROYECTO.md` |
| P1 | Auditoría documental completa: `hiddenActivations`/`outputWeights`, exclusividad de D2, olvido lineal, `src/render/` existente, ejemplo `new BrainView(...)`; decidir la frontera real de D2 y reescribir la regla 4 | 2 h | `src/brain/*.ts`, `docs/ADAPTER.md`, `docs/INTEGRACION-RUNTIME.md`, `README.md` |
| P1 | Convertir el barrido de semillas en test del protocolo A/B (≥8 semillas, informar fallos) y cambiar la métrica saturada por logits o usos/hora; control greedy con el mismo ε | 2–3 h | `tests/spatial-world.test.ts` |
| P1 | `snapshot()` de solo lectura en `BiochemEngine` y borrar los `tick(0)` de la UI; `serialize()` lanza si está `disposed` | 1 h | `src/biochem/engine.ts`, `src/main.ts` |
| P2 | `actionId` explícito en `BrainOutput.debug` y consumo por id en `main.ts` (dejar el escalar solo como transporte) | 1–2 h | `src/brain/adapter.ts`, `src/main.ts` |
| P2 | Limpiar la raíz: mover `bichito.html` a `docs/legacy/` o `.archive/`, fusionar `report.md` + `estudio-*` en un único `docs/ESTUDIO.md` con fecha, y `git mv` del `estudio-*.html` fuera del build | 30 min | raíz, `README.md` |
| P2 | Proceso: límite de tamaño de PR en `CONTRIBUTING.md`, test de consistencia documental, job CI que verifique cifras anunciadas o eliminación de esas cifras, `LICENSE` | 2 h | `.github/`, `CONTRIBUTING.md` |
| P2 | Perf UI: cachear `readPalette()`, saltar escrituras DOM cuando el valor redondeado no cambia, extraer CSS a `src/styles.css` | 1–2 h | `src/render/brain-view.ts`, `index.html` |

---

## 7. Resumen en una frase

**Un núcleo excelente (determinista, validado, bien testado) envuelto en una capa de afirmaciones que el código ya no sostiene: arreglad la conexión genoma→cerebro y la atribución del refuerzo, y sobre todo instalad un proceso que no permita que la documentación de estado la escriba quien escribe el código — el resto del repo ya está por encima de la media.**
