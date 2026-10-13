# CEREBRO — v0.5 real: MLP + ε-greedy + Hebbiano por refuerzo

Estado: **implementado e integrado en `main`** (PR #3); el puerto de debug D2
se integró después con el PR #4. Esta rama además enlaza los verbos al primer
mundo por eventos (ver [`ESTADO-PROYECTO.md`](ESTADO-PROYECTO.md)). `BrainV05`
sustituye al `PlaceholderBrain` en la app; el placeholder se conserva para
tests/regresión.

> Implementa el núcleo técnico de Fase 3 (red pequeña, selección de acción y
> refuerzo por recompensa). **No se da por cumplido el hito completo** de
> «aprender a buscar comida en <5 min»: aunque esta rama ya tiene un mundo
> mínimo por eventos, aún no hay navegación ni búsqueda espacial, así que el
> A/B en una tarea de juego real queda pendiente.

## Qué hay dónde

```
src/brain/
├── brainv05-types.ts   # contrato estructural (sin cambios)
├── adapter.ts          # BrainV05Adapter (sin cambios: D1 aprobado intacto)
├── runtime.ts          # createBrainRuntime (sin cambios)
├── actions.ts          # NUEVO: espacio de acciones (codebook escalar)
├── brain-v05.ts        # NUEVO: el cerebro real (BrainV05 implements BrainV05Like)
├── reward.ts           # NUEVO: recompensa por reducción de malestar
├── placeholder-brain.ts# se mantiene (temporal, ya no se usa en la app)
└── stub.ts             # se mantiene (Fase 0)
tests/
├── actions.test.ts              # codebook: validación y decodificación
├── brain-v05-shape.test.ts      # knobs, vector de entrada, rango de salida
├── brain-v05-determinism.test.ts# semilla, azar reproducible, sin Math.random
├── brain-v05-learning.test.ts   # premio/castigo, A/B, reversibilidad, ε
├── brain-v05-serialize.test.ts  # guardado/carga validados y dispose
├── brain-v05-integration.test.ts# genoma → fenotipo → red → adaptador → motor
├── reward.test.ts               # malestar y recompensa
└── app-smoke.test.ts            # index.html + main.ts en DOM de prueba
```

## La red

```
entrada (15) ──tanh──▶ oculta (hiddenSize) ──lineal──▶ puntuaciones (5 acciones)
                                                              │
                                                    softmax ──┴── ε-greedy
```

- **Entrada (15):** `drives[8] ++ stimuli[3] ++ genome[4]`, el vector del
  contrato v0.5. Todo se recorta a 0..1; `NaN` ⇒ 0; los vectores cortos se
  rellenan con 0 y los largos se recortan (la red nunca recibe un tamaño raro).
- **Oculta:** `h[j] = tanh(b1[j] + Σᵢ w1[j][i]·x[i])`.
- **Acciones:** `s[a] = b2[a] + Σⱼ w2[a][j]·h[j]`; `p = softmax(s)`.
- **Decisión:** `greedy = argmax s` (empate ⇒ índice menor, determinista). Con
  probabilidad ε se elige una acción uniforme al azar (exploración).
- **Inicialización:** uniforme escalada (`1/√fanIn`), bias a 0: ninguna acción
  nace favorecida.

### Knobs (los tres que aporta el genoma, más los propios del módulo)

| Parámetro | Gen | Rango | Por defecto |
|---|---|---|---|
| `hiddenSize` | `capacidad` | 4 → 64 | 12 |
| `epsilonInitial` | `exploracion` | 0.05 → 0.6 | 0.35 |
| `learningRate` | `aprendizaje` | 0.01 → 0.3 | 0.08 |
| `epsilonFloor` | — | 0..1 (saneado a ≤ ε inicial) | **0.05** (el «suelo 5 %» del brief) |
| `epsilonDecay` | — | (0, 1] por decisión | 0.9995 |
| `seed` | — | uint32 | 20261012 |
| `maxWeight` | — | > 0 | 4 |

Con el genoma por defecto (todos los genes a 0.5) la app construye una red de
**34 ocultas, ε inicial 0.325 y η 0.155**. ε decae por decisión hasta el suelo.
El modelo tardaría ~62 s si se llamara a `think()` a 60 Hz; la app actual decide
cada 0,75 s, así que desde 0,325 hasta el suelo de 0,05 tarda unos **47 minutos
simulados**. Es un parámetro por decisión, no por segundo.

## Espacio de acciones (codebook)

Cinco verbos sobre el eje **pasividad (−1) ↔ actividad (+1)**:

| índice | id | etiqueta | código |
|---|---|---|---|
| 0 | `descansar` | Descansar | −1 |
| 1 | `acurrucarse` | Acurrucarse | −0.5 |
| 2 | `observar` | Observar | 0 |
| 3 | `explorar` | Explorar | +0.5 |
| 4 | `buscar` | Buscar estímulo | +1 |

**Por qué un escalar y no un one-hot:** `BrainV05Adapter` (D1, aprobado y
fusionado) mapea la salida con `actions = [clamp(action, -1, 1)]`, y sus tests
fijan exactamente esa superficie (ni campos ni métodos nuevos en el adaptador).
Para no tocar código aprobado, el cerebro devuelve el **código** de la acción
elegida y quien consume la salida lo decodifica con `actionFromValue()` /
`actionNameFromValue()` de `src/brain/actions.ts` (codebook público, igual que
`DRIVE_ORDER`).

⚠️ **Decisión provisional.** La alternativa (one-hot de longitud N en
`BrainOutput.actions`) exige modificar el adaptador y su test de interfaz; sigue
como decisión de diseño en [`REVISIONES.md`](REVISIONES.md), no como una revisión
bloqueante. El mundo inicial de `src/world/` ya asocia cada `id` a un objeto y a
un evento; el codebook escalar sigue siendo solo el código de transporte.

El espacio es configurable (`new BrainV05({ actions: [...] })`) y se valida:
ids únicos y sin espacios, valores finitos en [-1, 1] y **únicos** (si no, el
código no podría decodificarse).

## Aprendizaje: Hebbiano modulado por recompensa

`think()` guarda la traza de la pasada (entrada `x`, oculta `h`). Con
`reinforce(códigoDeAcción, r)`, η = `learningRate` y `r` recortado a [-1, 1]:

```
Δw2[a][j] = η · r · h[j]                              ← pre × post, capa de salida
Δb2[a]    = η · r
Δw1[j][i] = η · r · (w2[a][j] · (1 − h[j]²)) · x[i]   ← Hebb encadenado a la entrada
Δb1[j]    = η · r · (w2[a][j] · (1 − h[j]²))
```

«Las sinapsis que dispararon la acción se refuerzan si la recompensa es positiva
y se debilitan si es negativa»: un paso de gradiente de política sobre el logit
de la acción, que es la versión moderna del refuerzo por químicos 204/205 del
original. Pesos y bias recortados a ±`maxWeight` (nunca explota la red).

Notas de comportamiento (todas con test):

- Sin `think()` previo, `reinforce()` es un **no-op** (no lanza), igual que el
  adaptador.
- Se puede reforzar **una acción distinta de la elegida** sobre la misma traza
  sensorial (útil para enseñar «esto otro habría estado mejor»).
- `reward = 0` no mueve pesos pero cuenta como refuerzo.
- La red conserva plasticidad: tras saturar una preferencia, invertir el signo
  del premio la voltea (test de reversibilidad).
- En la demo, **3-8 premios manuales** bastan para llevar una acción de ~20 % a
  >60-90 % de probabilidad.

## Recompensa por reducción de drive (`reward.ts`)

Señal de recompensa simplificada, antes de modelar neuroemisores dedicados:

```
malestar = Σ (w>0 ? w·nivel : |w|·(1−nivel)) / Σ|w|          ∈ [0, 1]
recompensa = clamp((malestarAntes − malestarDespués) · gain, −1, 1)   gain = 6
```

Pesos por defecto: aversivos `hambre`, `sueno`, `aburrimiento`, `miedo` (+1);
deseables `energia`, `confort`, `vinculo` (−1). Drive ausente ⇒ nivel 0. La
tabla es extensible (añadir una entrada no toca ninguna fórmula) y `gain` es
configurable.

**Honestidad sobre el estado actual:** el primer mundo por eventos hace que
algunos cambios de drive sí dependan del verbo elegido; sin navegación, objeto
objetivo por necesidad ni calibración, la señal todavía no demuestra una tarea
de aprendizaje real y la deriva intrínseca puede dominarla. Los botones
**Premiar/Castigar** permiten supervisar una decisión y el interruptor
«refuerzo automático» permite comparar con/sin esa fuente de aprendizaje.

## Verbos conectados al mundo (primer corte de Fase 4)

En esta rama, `main.ts` solicita una decisión cada 0,75 segundos simulados, no
cada fotograma, y mantiene ese verbo hasta la siguiente decisión. `src/world/`
resuelve los IDs actuales así: `descansar`/`acurrucarse` → nido, `buscar` →
comedero, `explorar` → pelota, `observar` → luz suave. Si el objeto terminó su
enfriamiento, devuelve un `BiochemicalImpulse`; `BiochemEngine.applyImpulse()`
valida y aplica el lote, limitado a los rangos de drives y químicos.

En la siguiente decisión, el refuerzo automático mide la variación de malestar
mientras el verbo estuvo activo. Los botones **Premiar/Castigar** siguen
reforzando manualmente la última decisión. La forma **Probar acción** ejecuta
un verbo de prueba sin enseñar al cerebro y descarta el siguiente refuerzo
automático para no atribuirle una intervención externa.

Este mundo es todavía **por eventos, no espacial**: no hay desplazamiento,
coordenadas, colisiones ni búsqueda de un objeto por distancia. Los valores y
cooldowns de cada efecto son iniciales y deben calibrarse con una tarea de juego
antes de evaluar aprendizaje autónomo.

## Determinismo

Cero `Math.random()` (hay test que lo espía), cero I/O, cero tiempo real. La
inicialización de pesos y la exploración ε salen de `mulberry32(seed)` — el
mismo PRNG del genoma (`src/genome/prng.ts`). Misma semilla + mismas entradas +
mismos refuerzos ⇒ mismas decisiones bit a bit, y el bucle completo
(`Genome` → `BiochemEngine` → `BrainV05Adapter`) también es reproducible.

## Guardar y cargar

`serialize()` devuelve JSON estable con `schemaVersion`, config, acciones,
contadores (`epsilon`, `thinks`, `reinforces`, `draws`, `lastReward`,
`rewardTotal`) y los cuatro arrays de pesos. `deserialize(json)` lo valida todo
y lanza `RangeError` en cuanto se sale del contrato:

- `schemaVersion` distinto, JSON inválido, payload que no es objeto;
- `hiddenSize` o espacio de acciones incompatibles con la instancia (construye
  el cerebro con los mismos knobs para cargar un estado);
- contadores no enteros o negativos, matrices con otra longitud o pesos no
  numéricos.

**El azar también se restaura:** se serializa el número de extracciones del PRNG
y al cargar se reconstruye `mulberry32(seed)` avanzado ese mismo número de
pasos, así que las decisiones siguientes son idénticas a las del original
(testeado). `dispose()` libera la red y cierra `think`/`reinforce`/`deserialize`
(lanzan `Error`); `getDebugState()` sigue disponible.

## Depuración y UI

`getDebugState()` (extra-contractual, como `listDrives()` en el motor) expone
config, ε, contadores, puntuaciones y probabilidades softmax de la última
pasada, última decisión, historial de recompensa y salud de los pesos. **No pasa
por el adaptador**: lo lee `main.ts`, que es quien construye el cerebro, y así
la regla del cerebro encapsulado sigue intacta para el resto del proyecto.

El panel «Cerebro de Nilo» de `index.html` muestra: acción tomada (y si fue
exploración ε), confianza, decisiones y refuerzos, medidor de ε, y una barra por
acción del codebook con su probabilidad — el aprendizaje se ve en directo.

## Decisiones y siguientes pasos

1. **Ratificar el codebook escalar** frente a la alternativa one-hot (decisión de
   producto/contrato, no PR pendiente).
2. **Confirmar los 4 genes de entrada** `[alerta, sociabilidad, resiliencia,
   metabolismo]` y los estímulos `[dopamina, cortisol, adenosina]`: siguen siendo
   provisionales; los providers del adaptador permiten sustituirlos.
3. **Vocabulario → `BrainInputs`**: aún no se cablea. `BrainV05Input` tiene tres
   canales de estímulo y `IVocab` no define cómo codificar palabras.
4. **Completar mundo espacial**: posición, movimiento y navegación a objetos;
   luego calibrar cooldowns y reward con una tarea y un A/B reproducible.
5. **LTW/olvido de pesos** (STW↔LTW del original) y consolidación durante el
   «sueño»: no están en v0.5; podrían entrar como `weightDecay` por refuerzo.
6. **Persistencia de la partida** (Fase 5): además de cerebro/genoma/vocabulario,
   falta serializar motor y mundo y coordinar guardado/carga desde la UI.
