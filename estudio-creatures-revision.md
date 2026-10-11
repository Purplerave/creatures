# Proyecto: sucesor moderno de Creatures (1996)
## Documento de trabajo para revisión por Claude
*Preparado por Tecnotron, 2026-10-11. Basado en investigación web con fuentes verificadas.*

---

## 1. Objetivo

Crear una criatura virtual web estilo *Creatures* (Creature Labs, 1996) pero con tecnología actual: genoma digital propio, red neuronal con aprendizaje por refuerzo, sistema de necesidades/drives, mundo con objetos interactivos, persistencia y reproducción con cruce genético y mutación. Proyecto de aficionado dirigiendo IAs programadoras (Tecnotron, DinoPablo, OpenCode).

Prototipo previo existente: "Bichito" — página estática con necesidades, red neuronal pequeña (9 entradas / 12 ocultas / 6 acciones), ADN sintético, aprendizaje de palabras por asociación, juguetes (pelota, dispensador, consola de luz) y export/import manual de estado.

---

## 2. Cómo funcionaba el Creatures original (resumen técnico)

**Genoma** (ficheros `.gen`, formato binario documentado por ingeniería inversa):
- Cabecera `dna3`, genes delimitados por marcador `gene`, marcador final `gend`, little-endian.
- Cabecera de gen: tipo (0=cerebro, 1=bioquímica, 2=criatura, 3=órgano), subtipo, ID secuencial (para alineación en cruce), generación, **switch-on** (etapa vital de activación: 7 etapas, de bebé a senil), flags (MUT, DUP, CUT, LINKMALE/LINKFEMALE, MIGNORE), mutabilidad 0-255, variante.
- 200-350 genes en 19 subtipos por Norn típico. **Principio clave: el genoma codifica estructuras, no comportamientos.** Genética haploide; cruce con alineación por ID.
- Referencias: `creatures.fandom.com/wiki/GEN_files`, `github.com/ugwun/creatures3-engine-port/tools/docs/genome_deep_dive.md`.

**Cerebro (SVRule)** — referencia: `github.com/thechimpmatrix/nornbrain/docs/reference/svrule-brain-complete-reference.md`:
- ~1.000 neuronas en 9 lóbulos (C1): Perception 112, Drive 16, Stimulus Source 40, Verb 16, Noun 40, General Sense 32, Decision 16, Attention 40, Concept 640. Tractos conectan lóbulos (en C3, cualquiera con cualquiera).
- Neurona: 8 floats + acumulador. Dendrita: STW (peso corto plazo), LTW (peso largo plazo), STRENGTH (0 = suelta, migra hacia NGF).
- Cada neurona/dendrita ejecuta una **SVRule**: programa de 48 bytes = 16 instrucciones × 3 bytes (opcode, tipo operando, dato). **Todo programa posible es sintácticamente válido** (diseño deliberado: robusto ante mutación).
- Aprendizaje: dinámica bidireccional STW↔LTW (olvido y consolidación). Refuerzo vía **químicos 204 (recompensa) / 205 (castigo)**.
- Decisión por **Winner-Takes-All** (spare neuron): se lee el ganador de `attn` (qué objeto) y `decn` (qué acción); el motor ejecuta el script correspondiente sobre el objeto atendido.
- **Instintos**: genes que simulan "soñar" (químico 213 = REM): fijan un escenario e inyectan refuerzo; los pesos se ajustan con las reglas normales de aprendizaje "como si" la criatura lo hubiera vivido.

**Bioquímica**:
- 256 químicos (0-1) con half-life individual → homeostasis. Hasta 128 órganos con clock rate propio.
- Reacciones `A + B → C + D`, receptores (químico→fisiología), emisores (fisiología→químico), neuroemisores (neurona→químico).
- **20 drives** (químicos 148-167): dolor, 3 hambres, frío, calor, cansancio, sueño, soledad, agobio, miedo, aburrimiento, ira, libido, confort + 5 de navegación.
- ~99 estímulos sensoriales; cada uno ajusta hasta 4 químicos. Aprendizaje **conductista por reducción de drives**.

**CAOS**: lenguaje de registros, opcodes de 4 letras, scripts identificados por (género, especie, familia, evento). En un sucesor web puede sustituirse por handlers de eventos JS por tipo de objeto.

---

## 3. Estado del ecosistema open-source (verificado 2026-10-11)

- **openc2e** (`github.com/openc2e/openc2e`): ACTIVO (commits mayo 2026, migración SDL2→SDL3, mantenedor casi único ligfx). Reimplementa CAOS, bioquímica, SVRule; criaturas C3+ "funcionan algo", C1/C2 nada; **sin guardado de mundo**. LGPL-2.1. Necesita los **datos propietarios** del juego original (vía legítima: comprar "Creatures Exodus" en Steam).
- **openc2e-nb** (`github.com/thechimpmatrix/openc2e-nb`): fork del proyecto NORNBRAIN — cerebro Python enchufable vía pybind11 dentro del tick del motor. **nornbrain** reemplaza el lóbulo `comb` por red líquida **CfC + NCP** (239 neuronas, 4 módulos). Proyecto de investigación unipersonal (abril 2026): útil como referencia de diseño, no como dependencia.

---

## 4. Enfoques modernos viables 100% en cliente

- **RL con redes pequeñas**: MLP en JS puro (~200 líneas) o TensorFlow.js; patrón: inferencia en cliente, entrenamiento pesado offline.
- **NEAT**: neataptic está unmaintained; mejor uso **offline como diseñador de "instintos"** (pesos iniciales), no evolución en vivo (mala UX).
- **Redes líquidas CfC**: paper Hasani et al. 2021 (arXiv:2106.13898); la formulación cerrada de 2025 no necesita solver de ODEs → implementable en JS puro; ~200 neuronas con memoria temporal emergente.
- **Drives**: conservar el modelo Creatures (~20 floats) o su equivalente moderno (utility AI).
- **Memoria episódica**: buffer de episodios (situación, acción, Δdrives) con decaimiento + consolidación en "sueño".

---

## 5. Propuesta de arquitectura (opción recomendada: reimplementación web desde cero)

openc2e como base web es **inviable** (C++ escritorio, LGPL copyleft, datos propietarios, criaturas incompletas). Se propone:

- **Genoma propio en JSON versionado** (no binario): genes de química + cerebro + instinto; cruce con recombinación/mutación (puntual, duplicación, eliminación); flags MUT/DUP/CUT; switch-on por etapa vital.
- **Cerebro moderno pequeño**: MLP o CfC ~200 neuronas; atención+decisión por WTA; Hebbiano STW/LTW con refuerzo por **reducción de drive**; "sueño" de instintos como en el original.
- **Bioquímica simplificada**: químicos con half-life, reacciones A+B→C+D, receptores/emisores, 20 drives.
- **Mundo 2D** con objetos por eventos (sustituto pragmático de CAOS).
- **Persistencia**: IndexedDB + export/import de genomas JSON; ciclo de vida (envejecimiento por etapas, reproducción con cruce real, muerte).
- Estimación: **3-6 meses** (aficionado + IAs) hasta núcleo jugable.

---

## 6. Hoja de ruta por fases (con hitos verificables)

- **Fase 0 — Fundaciones (sem. 1-2)**: repo TS + Canvas, bucle de juego, mundo 2D, criatura que deambula. *Hito: criatura visible moviéndose.*
- **Fase 1 — Bioquímica y drives (sem. 3-5)**: químicos con half-life, reacciones, 20 drives, estímulos. *Hito: gráfica de drives en vivo; comer reduce hambre y sube recompensa.*
- **Fase 2 — Genoma (sem. 6-8)**: JSON versionado, cruce y mutación, toda mutación da un genoma legal. *Hito: cruce de dos genomas → tercero válido.*
- **Fase 3 — Cerebro v1 (sem. 9-13)**: red ~200n, WTA, Hebbiano con refuerzo por drives, sueño de instintos. *Hito: aprende a buscar comida en <5 min; A/B con aprendizaje off muestra diferencia.*
- **Fase 4 — Mundo y objetos (sem. 14-18)**: objetos con eventos, física simple, habitaciones. *Hito: 3 objetos usados autónomamente según drives.*
- **Fase 5 — Persistencia y ciclo de vida (sem. 19-22)**: IndexedDB, export/import JSON, envejecimiento, reproducción, muerte. *Hito: recargar restaura el mundo; cría con rasgos mezclados.*
- **Fase 6 — Pulido (sem. 23+)**: UI (panel de drives, "brain in a vat"), editor de genomas, docs. Opcional: lectura de `.gen` clásicos.

---

## 7. Preguntas para tu revisión, Claude

1. ¿La opción (a) — reimplementación web desde cero — te parece la correcta, o ves una vía híbrida con openc2e/WASM que no estemos valorando bien?
2. Para el cerebro: ¿MLP + Hebbiano por refuerzo de drives, o red líquida CfC? ¿Qué elegirías para ~200 neuronas en JS y por qué?
3. ¿Qué riesgos ves en la hoja de ruta (fases, estimaciones, "pegamento" mundo/UI/contenido)?
4. El genoma en JSON versionado en vez de binario: ¿qué perderíamos respecto al formato `.gen` original que pudiera importar después?
5. ¿Añadirías o quitarías alguna fase? ¿Cambiarías el orden?
6. Tres sugerencias previas que quiero validar contigo: (a) capa de salida con pesos propios y aprendizaje por refuerzo, (b) que las palabras aprendidas se olviden si no se repiten, (c) autoguardado de estado. ¿Las ves bien encajadas en esta arquitectura?
