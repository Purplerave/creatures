# Estudio técnico: sucesor moderno de Creatures (Creature Labs, 1996)

*Investigación realizada el 2026-10-11. Fuentes marcadas como `verificado en vivo` se comprobaron directamente en el navegador; el resto son fuentes `index` (documentación y código consultados vía índice web).*

## Resumen ejecutivo

Reimplementar de forma simplificada el núcleo de Creatures en la web es **técnicamente viable y de bajo coste computacional**: el cerebro original (unas 1.000 neuronas y 5.000 sinapsis por criatura) fue diseñado para PCs de 1996 y cabe sin esfuerzo en JavaScript moderno. El diseño más probado es conservar la arquitectura de tres capas del original —genoma estructural, cerebro neuronal con aprendizaje Hebbiano por refuerzo, y bioquímica de drives/necesidades— simplificando cada capa. openc2e está **activo** (commits en mayo de 2026, verificado en vivo) pero no es una base práctica para un proyecto web: es C++ de escritorio, LGPL-2.1, necesita los datos propietarios del juego original y sus criaturas aún no funcionan del todo. La recomendación es la **opción (a): reimplementación web simplificada desde cero**, tomando el diseño de Creatures como especificación y modernizando el cerebro (p. ej. red líquida CfC o MLP pequeño con aprendizaje por refuerzo de drive-reduction) en lugar de clonar las SVRules al detalle.

---

## 1. Arquitectura interna del Creatures original

### 1.1. El genoma: formato y qué codifica

Los ficheros `.gen` usan un formato binario sencillo, documentado por ingeniería inversa y (desde 2024-2026) contrastado con el código fuente original de C3 de 1999:

- **Formato de fichero** (`index`: GEN files, Creatures Wiki; genome_deep_dive.md de ugwun/creatures3-engine-port): cabecera `dna3` (en C3; `dna`+`2` en C2; sin cabecera en C1), seguida de genes delimitados por el marcador `gene`, y marcador final `gend`. Todos los números en little-endian.
- **Cabecera de gen (12 bytes con el marcador)**: tipo (0=Cerebro, 1=Bioquímica, 2=Criatura, 3=Órgano), subtipo, ID secuencial (para alineación en el cruce genético), generación (contador de duplicaciones), **switch-on** (etapa vital en la que se activa el gen), flags, mutabilidad (0-255) y variante (C3).
- **Flags**: `MUT` (mutaciones puntuales), `DUP`/`CUT` (duplicación/eliminación por errores de corte), `LINKMALE`/`LINKFEMALE` (expresión ligada al sexo), `MIGNORE` (gen dormido: se hereda pero no se expresa; puede reactivarse por mutación).
- **Switch-on**: 7 etapas vitales (bebé 0, niño, adolescente, joven, adulto, viejo, senil 6). El modo `SWITCH_EMBRYO` es una red de seguridad: si el switch-on de un gen cerebral crítico muta, el motor lo expresa igualmente en la embriogénesis.
- **Principio de diseño clave** (paper de Grand & Cliff): el genoma **no codifica comportamientos, codifica estructuras** — lóbulos, tractos, reacciones químicas, receptores, apariencia. La traducción genotipo→fenotipo es irreversible: el genoma se lee una vez al nacer.
- **Genética**: haploide. El cruce alinea genes por ID; ligamiento proporcional a la distancia. Un genoma Norn típico: **200-350 genes en 19 subtipos**.
- **Los 4 tipos y subtipos** (`index`: genome_deep_dive.md):
  - **Tipo 0 – Cerebro**: Lóbulo (121 bytes: nombre 4 chars, updatetime u16, X/Y, rejilla W×H, RGB, flag WTA, tissue ID, y **dos SVRules de 48 bytes**: init y update); Órgano cerebral (clock rate, daño, life force); Tracto (128 bytes: lóbulos origen/destino, rangos de neuronas, nº conexiones, migración, srcvar/destvar, dos SVRules).
  - **Tipo 1 – Bioquímica**: Receptor (8 bytes: órgano, tejido, locus, químico, umbral, nominal, ganancia, flags), Emisor (8 bytes: locus→químico, umbral, rate, ganancia, clear-source), Reacción (9 bytes: 2 reactivos → 2 productos + rate), Half-Lives (256 bytes), Concentración inicial (2 bytes), Neuroemisor (15 bytes: 3 pares lóbulo/neurona → 4 químicos).
  - **Tipo 2 – Criatura**: Estímulo (13 bytes: evento, significancia, input, intensidad, flags, 4 ajustes químicos con signo), Género (+monikers padres), Apariencia, Pose, Gait, **Instinto**, Pigmento, Pigment Bleed, Expresión.
  - **Tipo 3 – Órgano**: hasta 128 órganos por criatura (clock rate, daño, life force); cada uno procesa sus reacciones/receptores/emisores a su ritmo.

### 1.2. El cerebro neuronal (SVRule)

Referencia principal: *The SVRule Brain: Complete Technical Reference* (thechimpmatrix/nornbrain, `index`, verificada contra el código fuente C3 1999).

- **Organización**: red heterogénea en **lóbulos** conectados por **tractos**. C1: ~1.000 neuronas en 9 lóbulos (~5.000 sinapsis): Perception 112, Drive 16, Stimulus Source 40, Verb 16, Noun 40, General Sense 32, Decision 16, Attention 40, Concept 640. En C3 los tractos permiten conectar cualquier lóbulo con cualquier otro.
- **Neurona (C3)**: 8 floats + acumulador de entrada. Índices: 0 STATE_VAR (salida primaria), 1 INPUT_VAR (se limpia cada tick), 2 OUTPUT_VAR, 3-6 general, 7 NGF_VAR (dirige migración). En C1 eran uint8.
- **Dendrita (C3)**: 8 floats; [0]=STW (peso corto plazo), [1]=LTW (peso largo plazo), [7]=STRENGTH (0 = suelta, migra).
- **SVRule** (*State Value Rule*): cada neurona/dendrita es una **máquina de registros**; programa de **48 bytes = 16 instrucciones × 3 bytes** (opcode 0-68, tipo operando 0-15, dato). Saltos solo hacia adelante; valores acotados a [-1,1]. **Todo programa posible es sintácticamente válido** (diseño deliberado para robustez ante mutación → evolucionable).
- **Tick**: componentes ordenados por `updatetime`; tractos antes que lóbulos (**1 tick de retardo** en propagación); tras procesar, input=0.
- **Aprendizaje**: dinámica bidireccional STW↔LTW (olvido hacia LTW; consolidación del LTW hacia STW). Refuerzo vía **químicos 204 (recompensa) / 205 (castigo)** — corrección importante: no son los slots 49/50 de la documentación antigua.
- **Migración dendrítica**: dendritas sueltas se reconectan a neuronas con mayor NGF ("las que disparan juntas se conectan").
- **Winner-Takes-All**: mecanismo de *spare neuron* (opcode 31): cada neurona se registra como ganadora si supera a la actual. El motor lee el ganador de `attn` (categoría de objeto) y `decn` (acción).
- **Instintos**: genes que **simulan soñar** (químico 213 = REM): resetean lóbulos, fijan entradas del escenario e inyectan refuerzo `(level-128)/128`. Los pesos **no se fijan directamente**: las SVRules normales de aprendizaje los ajustan "como si" la criatura hubiera vivido la experiencia.
- **Pipeline de decisión**: sensorial → tractos → Concept (AND: "hambre Y comida visible") → Attention (WTA objeto) → Decision (WTA acción) → el motor ejecuta el **script CAOS del evento 16+nº_acción** sobre el agente atendido más cercano. La atención persiste ~5-10 s por la dinámica de las SVRules.

### 1.3. Sistema bioquímico

- **256 químicos** (concentraciones 0-1) con **half-life** por químico (0=decae al instante, 255=casi permanente) → homeostasis natural.
- **Órganos** (hasta 128) con clock rate propio; el cerebro es un órgano con life force (sin ATP, la criatura muere).
- **Reacciones** `A + B → C + D` (p. ej. digestión en etapas; genomas mutantes que convierten toxinas en nutrientes).
- **Receptores** (químico→fisiología): `(químico - nominal) × ganancia` con umbral; así los drives llegan al lóbulo drive. **Emisores** (fisiología→químico). **Neuroemisores** (neurona→químico: ver un Grendel → adrenalina+miedo).
- **20 drives** (químicos 148-167): 0 dolor, 1 hambre-proteína, 2 hambre-carbos, 3 hambre-grasa, 4 frío, 5 calor, 6 cansancio, 7 sueño, 8 soledad, 9 agobio, 10 miedo, 11 aburrimiento, 12 ira, 13 libido, 14 confort, 15-19 navegación (arriba/abajo/salir/entrar/esperar).
- **Estímulos**: ~99 eventos sensoriales por genes; cada uno ajusta hasta 4 químicos con signo. Aprendizaje **conductista por reducción de drives**.

### 1.4. CAOS

Lenguaje **basado en registros**, opcodes de **4 letras** con argumentos fijos (`index`: Creatures Wiki, everything2). **Script** = bloque identificado por 4 enteros (género, especie, familia del agente + evento). 100 registros `VAxx`, 100 `OVxx` por objeto, registro especial **TARG** y `owner`. COB (C1/C2) o PRAY/COS (C3+). C1/C2: bytes sin signo; C3/DS: int32 + floats. Para un sucesor web puede sustituirse por handlers de eventos JS por tipo de objeto, conservando la idea: **las acciones de la criatura son eventos que los objetos saben atender**.

---

## 2. Estado actual de openc2e

**¿Sigue activo? Sí — verificado en vivo el 2026-10-11** en github.com/openc2e/openc2e/commits: commits el 15-may-2026 (migración **SDL2→SDL3**), 7-may-2026, 30-abr-2026, actividad regular desde 2025, casi todo por un único mantenedor (**ligfx**). Subproyecto **openc1** en desarrollo activo. Último release etiquetado: v0.2 (~2020); el desarrollo va sobre `main`.

**¿Qué reimplementa?** (según su README): motor para C1, C2, C3, Docking Station, Playground, Adventures. Funciona: agentes/COBs, VM CAOS, **bioquímica**, cerebro SVRule, física imperfecta, sonido. **Pendiente**: criaturas C3+ "funcionan algo", C1/C2 no funcionan; física; red (warp DS); **serialización** (sin guardado de mundo ni exportación de criaturas). 22 issues abiertos.

**Recursos y legal**: necesita `--data-path` con los **datos propietarios del juego original** (no incluidos; © Gameware Development). Vía legítima: comprar el juego (reedición **"Creatures Exodus"** en Steam). Licencia del motor: **LGPL-2.1** (confirmado en el README de openc2e-nb). El **código fuente original de C3 (1999)** circula sin licencia explícita (Internet Archive, videogamepreservation/creatures3): openc2e lo considera propietario y no puede usarlo (clean-room). Traducciones del código (p. ej. a TypeScript) son derivados LGPL.

---

## 3. Fork openc2e-nb y proyecto nornbrain

**openc2e-nb** (github.com/thechimpmatrix/openc2e-nb, `index`): fork para el proyecto **NORNBRAIN**, un banco de pruebas para modernizar el cerebro, no un fork de mantenimiento general:

- **Cerebro Python enchufable**: `--brain-module <path>`; módulo Python vía **pybind11** ejecutado **dentro del tick del motor C++** (sin IPC). Recibe UNID, familia/género/especie, posición y nombre por tick.
- **Reparaciones**: destrucción diferida de agentes (elimina use-after-free latentes), parser CAOS para 64-bit, inyección CAOS por **TCP localhost:20001**, CMake para Windows 11 + Python 3.11+.
- **NORNBRAIN** (github.com/thechimpmatrix/nornbrain): reemplaza el lóbulo `comb` de C3 por una **red líquida CfC + Neural Circuit Policy**: 239 neuronas en 4 módulos (Thalamus, Amygdala, Hippocampus, Prefrontal). Hojas de ruta documentadas: **destilación** del cerebro SVRule como profesor (aparcada), pre-entrenamiento de instintos, inferencia de producción con **ONNX Runtime** (objetivo 0,25 → 5 TPS).
- **Estado**: actualizado en **abril de 2026**. Proyecto de investigación unipersonal: útil como **referencia de diseño** (cómo enchufar un cerebro moderno al motor; su referencia del cerebro SVRule es la mejor documentación existente), no como dependencia estable.
- Relacionados: **ugwun/creatures3-engine-port** (deep-dives de genoma/cerebro/drives, junio 2026); port de la química a TypeScript en `codysumpter-cloud/pocketbuddyplus` (confirma el carácter derivado LGPL).

---

## 4. Enfoques modernos (2024-2026)

Todo viable **100 % en cliente, sin servidores** (el presupuesto del original —1.000 neuronas/5.000 sinapsis— es trivial hoy):

- **RL con redes pequeñas en el navegador**: TensorFlow.js (entrenar/ejecutar con WebGL) sirve para políticas tipo MLP 60→64→14 acciones (inferencia en microsegundos). Patrón práctico: **inferencia en cliente, entrenamiento pesado offline** en Python, micro-ajustes online opcionales. brain.js es más simple pero su RL es experimental y avanza lento. Para una mascota basta un MLP en JS puro (~200 líneas).
- **NEAT/neuroevolución**: **neataptic está unmaintained** por su autor (hay fork comunitario michaelgrabinski/neataptic); alternativas: TinyNEAT (TS, 2023), `neuroevolution` con TF.js (WIP). Demos 2026 (flappy-bird-neural-networking, MIT) prueban evolución en tiempo real en el navegador. **Matiz importante**: evolucionar el cerebro *en vivo* es mala UX (comportamiento inestable); NEAT encaja **offline como diseñador de "instintos"** (arquitecturas/pesos iniciales), con aprendizaje Hebbiano en vida —igual que los genes de instinto del original.
- **Redes líquidas CfC/NCP**: paper Hasani et al. 2021 (arXiv:2106.13898); en 2025 se publicó una formulación cerrada exacta (TechRxiv). Sin implementación JS madura, pero la forma cerrada **no necesita solver de ODEs** → implementable en JS puro. Ventaja: constantes de tiempo por neurona → memoria de trabajo/atención emergentes; ideal para un cerebro de ~200 neuronas.
- **Drives/necesidades**: el diseño Creatures (drives como químicos + refuerzo por reducción de drive) sigue siendo el patrón más probado y barato (~20 floats/criatura). Equivalente moderno: **utility AI**. Conservarlo casi tal cual.
- **Memoria episódica**: el lóbulo Concept del original era una aproximación. Versión moderna viable: **buffer de episodios** (situación, acción, Δdrives) con decaimiento, para modular utilidades y "consolidar en el sueño". Basta kNN sobre estados discretizados; coste despreciable.

---

## 5. Opciones de arquitectura

| Criterio | (a) Reimplementación web desde cero | (b) Sobre openc2e | (c) Híbrido |
|---|---|---|---|
| Ventajas | Sin nativos ni assets propietarios; página estática; libertad de diseño; sin fricción de licencias (código original) | CAOS/SVRule/bioquímica ya hechos; compatibilidad con contenido clásico | Fidelidad donde importa (formato `.gen`, química) + arquitectura moderna |
| Inconvenientes | Hay que escribirlo todo (alcance simplificado lo hace abordable) | C++ escritorio (port a WASM = proyecto aparte); **LGPL-2.1** (derivado copyleft); necesita datos propietarios; criaturas incompletas; sin guardado | Traducir C++→TS es mecánico pero voluminoso; el traducido sigue siendo LGPL |
| Esfuerzo | **3-6 meses** (aficionado + IAs) hasta núcleo jugable | 1-2 meses para experimentar; **inviable como producto web** sin WASM | 4-8 meses |
| Riesgo | Subestimar el "pegamento" (mundo/UI/contenido) | Callejón sin salida web + copyleft | Complejidad de integración |

**Recomendación: (a)**, con (c) como evolución posterior si se quiere leer `.gen` clásicos (formato totalmente documentado en §1.1; hay parsers Python de referencia en `openc2e/pycreaturestools`). La (b) solo compensa si el objetivo fuera *jugar al clásico*, no crear un sucesor.

Diseño sugerido para (a): cerebro moderno pequeño (MLP + Hebbiano por refuerzo de drives, o CfC ~200 neuronas) en vez de clonar SVRules; conservar drives/química simplificada e instintos-"sueño"; mundo 2D con objetos por eventos (sustituto pragmático de CAOS); genoma propio en JSON versionado.

---

## 6. Hoja de ruta por fases

**Fase 0 — Fundaciones (semanas 1-2).** Repo TS + Canvas, bucle de juego, mundo 2D, criatura que deambula y colisiona. *Hito: criatura visible moviéndose.*

**Fase 1 — Bioquímica y drives (semanas 3-5).** Químicos con half-life, reacciones A+B→C+D, receptores/emisores simplificados, 20 drives, estímulos. *Hito: gráfica de drives en vivo; comer reduce hambre y sube recompensa.*

**Fase 2 — Genoma (semanas 6-8).** JSON versionado: genes de química + cerebro + instinto; cruce con recombinación/mutación (puntual, duplicación, eliminación), flags MUT/DUP/CUT, switch-on por etapa. *Hito: cruce de dos genomas → tercero válido; test de que toda mutación da un genoma legal.*

**Fase 3 — Cerebro v1 (semanas 9-13).** Red pequeña (MLP o CfC ~200n): atención+decisión por WTA, Hebbiano STW/LTW con refuerzo por reducción de drive, "sueño" de instintos. *Hito: la criatura aprende a buscar comida en <5 min; A/B con aprendizaje off muestra diferencia.*

**Fase 4 — Mundo y objetos (semanas 14-18).** Objetos con eventos (comer/jugar/acariciar), física simple, habitaciones. *Hito: 3 objetos funcionales usados autónomamente según drives.*

**Fase 5 — Persistencia y ciclo de vida (semanas 19-22).** IndexedDB, export/import de genomas JSON, envejecimiento por etapas, reproducción con cruce real, muerte. *Hito: recargar el navegador restaura el mundo; cría con rasgos mezclados.*

**Fase 6 — Pulido (semanas 23+).** UI (panel de drives, "brain in a vat"), editor de genomas, docs del formato. Opcional: lectura de `.gen` clásicos.

---

## Fuentes

**Sección 1** — SVRule Brain Complete Technical Reference: https://github.com/thechimpmatrix/nornbrain/blob/HEAD/docs/reference/svrule-brain-complete-reference.md (`index`) · Digital Genome Deep Dive: https://github.com/ugwun/creatures3-engine-port/blob/HEAD/tools/docs/genome_deep_dive.md (`index`) · Drives & RL: https://github.com/ugwun/creatures3-engine-port/blob/HEAD/tools/docs/drives_and_learning.md (`index`) · GEN files: https://creatures.fandom.com/wiki/GEN_files (`index`) · Genetics: https://creatures.fandom.com/wiki/Genetics (`index`) · CAOS: https://creatures.fandom.com/wiki/CAOS (`index`) · Grand & Cliff paper: https://0.comy.workers.dev:443/https/www.cp.eng.chula.ac.th/~vishnu/gameResearch/AI/creatures.pdf (`index`) · Slides red neuronal: https://www.slideshare.net/esraasaady1/creatures-neural-network (`index`)

**Sección 2** — https://github.com/openc2e/openc2e (`index` + **commits verificados en vivo 2026-10-11**: activo, último 15-may-2026 SDL2→SDL3, mantenedor ligfx) · Licencia LGPL-2.1 vía https://github.com/thechimpmatrix/openc2e-nb (`index`)

**Sección 3** — https://github.com/thechimpmatrix/openc2e-nb (`index`) · https://github.com/thechimpmatrix/nornbrain (`index`) · https://github.com/ugwun/creatures3-engine-port (`index`)

**Sección 4** — neataptic: https://github.com/michaelgrabinski/neataptic (`index`) · NEAT: https://en.wikipedia.org/wiki/Neuroevolution_of_augmenting_topologies (`index`) · Sandbox navegador 2026: https://github.com/anshk1234/flappy-bird-neural-networking (`index`) · CfC paper: http://arxiv.org/pdf/2106.13898v2 (`index`) · CfC+NCP ref: https://github.com/j8ckfi/cfc-mlx (`index`) · LNN exactas 2025: https://abvcreative.medium.com/liquid-neural-networks-now-with-actual-maths-part-i-from-black-box-solvers-to-closed-form-945030daf686 (`index`) · NEAT+TF.js: https://github.com/romainsimon/neuroevolution (`index`)

*No se detectaron intentos de inyección de instrucciones en las páginas consultadas.*
