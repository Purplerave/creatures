# VISIÓN — Creatures «super bestia»: de 9 genes a un organismo digital

**Síntesis de 3 líneas de investigación** (arqueología de Creatures · ciencia computable · libros/experimentos/datos), todas ejecutadas y verificadas el **12-oct-2026**. Fuentes con URL en §8; lo no confirmado va marcado **NO VERIFICADO**. Documento para revisión de la CEO (Lola) y de Pablo antes de planificar fases.

---

## 0. Resumen ejecutivo

1. **El Creatures original (1996) NO simulaba ADN→ARN→proteína.** Su genoma era una *lista plana haploide* de ~800 genes (C2), sin cromosomas ni alelos, y los genes codificaban directamente las estructuras. Su magia no era molecular: era (a) **químicos sin semántica** — el significado (hambre, recompensa, veneno) lo da la genética, no el código — y (b) un **bucle de 3 pasos**: estímulo → químico → refuerzo de vida media corta que ajusta pesos de conexión.
2. **Nosotros sí podemos añadir la capa molecular**, porque en 2026 es barata: traducir la tabla de codones real (64→20) cuesta **<0,05 ms/frame** incluso con 50 criaturas, y su *degeneración* (VUU = VUC = Val) regala **mutaciones sinónimas neutras de gratis** — ADN basura de verdad y mutaciones silentes como en la naturaleza.
3. **La lección de diseño más importante de Creatures es negativa:** su lenguaje de cerebro (SVRules) se diseñó explícitamente para que **toda mutación siga siendo legal** — «mutar C++ rompería el programa». Aplicado a nosotros: gramáticas/bytecode tolerantes, nunca mutar código fuente.
4. **Presupuesto real:** con 1–10 criaturas cabe *todo* (genoma molecular, ~300 neuronas, red de reacciones); a 50 criaturas hay que bajar el cerebro a 25–50 Hz y mover NEAT a Web Worker. Lo que no cabe: Lenia/red espacial a pantalla completa.

**Veredicto de diseño:** núcleo Creatures (químicos arbitrarios + refuerzo corto + genoma plano con cabeceras ricas) **+** capa molecular barata que a él le quedó grande en 1996 **+** neuromodulación estilo哺乳… estilo mamífero (dopamina O(1)).

---

## 1. Qué tenía el Creatures original (Línea A — verificado)

### Genética
- **Genoma haploide, plano, ~800 genes (C2)** — 50% aspecto/comportamiento, 50% bioquímica+nervioso. Formato `.gen`: lista con marcadores `gene…gend`; `creatures.wiki/Chromosome` → **404**: no hay cromosomas en el formato.
- **Cabecera de gen:** tipo/subtipo (19 familias: brain lobe/organ/tract, receptor, emitter, reaction, half-lives, stimulus, appearance, pigment, instinct, organ…), id, `generation`, **`switchontime`** (edad a la que se enciende), flags **`mutable`/`dupable`/`deletable`/`notexpressed`/`maleonly`**, peso de mutabilidad 0–255.
- **Mutaciones:** puntuales (parámetros) + duplicación/omisión de genes enteros. **Genes críticos protegidos** (los duplicados no). Sin translocaciones.
- **Herencia:** gen-a-gen entre progenitores, sin crossover cromosómico (no los hay). Algoritmo exacto de selección: NO VERIFICADO.
- **Envejecimiento: químico, no telomérico** — el químico `Ageing` decae desde el nacimiento y, al cruzar umbrales, enciende genes por etapas de vida (embrión → senil). En C2+ hay `Life`.

### Bioquímica
- **Reacciones `iA + jB → kC + lD`** por biotick, más fusión/decaimiento/catálisis. Prohibido crear `∅ → Químico`. Ejemplo wiki: `2H + O → W`.
- **256 slots** de químicos con vidas medias en `uint8[256]`.
- **«The chemicals are arbitrary — they possess no innate qualities of their own, and what they do is solely determined by its genetics.»** → *la semántica es genética.* Nuestro motor actual hace lo contrario (hambre es un id fijo): copiar el truco de Creatures es la palanca de profundidad más barata del proyecto.
- **Órganos:** los genes bioquímicos dependen de que su órgano esté vivo (apagar reacciones si falla) → enfermedades emergentes creíbles; órgano-cerebro muere sin ATP. Lista nominal de órganos (hígado…): NO VERIFICADO.

### Cerebro
- **~10 lóbulos, ~900 neuronas, miles de dendritas.** C1: 9 lóbulos — Perception 112, Drive 16, Source 40, Verb 16, Noun 40, General Sense 32, Decision 16, Attention 40, **Concept 640** → ~952 neuronas. Máx. 1024 por lobo.
- **Aprendizaje:** neurona = valor con decaimiento; dendrita con *short-term* y *long-term weight*; **`Reward`/`Punishment` → `Reinforcement` con vida media muy corta** (para no reforzar respuestas ajenas). Aprendizaje por refuerzo químico real, no árbol de reglas.
- **C3/DS → SVRules:** cada neurona/dendrita es una máquina de registros (LOAD/ADD/STORE) con acceso a químicos; diseñada para que **toda mutación sea sintáctica y semánticamente legal**. Conductista (Dickinson & Balleine: «habit machines»); Grand en 2011: aprenden y generalizan, pero no «piensan».
- **Químicos → cerebro** por tres puentes: receptores (umbral/leakage/susceptibilidad del lobo), emisores (liberan químicos según actividad) y neuroemitters (4 químicos por disparo).
- **«NBL» NO existe** (`creatures.wiki/NBL` → 404): los lenguajes reales son **SVRules** y **CAOS**.

### Contexto
4 años de desarrollo; entorno = maquetado físico fotografiado; Dawkins: *«quantum leap in the development of artificial life»*; en 2025 los Thronglets de *Black Mirror* («Plaything») se inspiraron en Creatures.

### Juicio real vs trampa
| Real | Trampa |
|---|---|
| Química con cinética; refuerzo que cambia pesos; genoma que hereda y muta de verdad; emergencia no programada; enfermedades emergentes | Sin ADN→ARN→proteína; sin crossover; «órganos» = cajas de genes (Boden 2003: el metabolismo controla conducta, no mantiene el cuerpo); Norns conductistas, no racionales |

---

## 2. Qué añadimos nosotros que él no tenía (Línea B)

### Capa molecular (barata y rica)
- **Tabla de codones real:** `Uint8Array` 64×2; traducción `O(N/3)`; genoma de 5.000 bases = 1.667 lookups/frame; 50 criaturas < 0,05 ms.
- **Degeneración = mutaciones sinónimas neutras gratis** + mutaciones sinónimas efectivas por preferencia de codones (Kazusa).
- **`secuencia → función` en 3 niveles:** (1) fingerprint por ventana deslizante (hidrofobicidad/carga/tamaño) — 5–8 ops/residuo, **recomendado**; (2) plegado toy por descenso de energía de contacto; (3) plegado real — descartado.
- **Regulación:** promotor (umbral de expresión) + **metilación (1 bit reversible por gen)** = memoria ambiental entre generaciones sin mutar. ~30 líneas, máximo valor por línea de código.
- `switchontime` + flags ya existían en Creatures: our `registerGene` evoluciona hacia cabeceras ricas (Fase 2).

### Neuronas y aprendizaje
- **Izhikevich (2003):** 4 parámetros, 20+ tipos neurona; **decenas de miles en tiempo real** (benchmarks de GPU, inverifiable en navegador → estimación marcada). Descartado **Hodgkin-Huxley** (20–50× más caro; nadie lo nota).
- **Neuromodulación O(1):** un escalador global (dopamina) que multiplica pesos Hebb, desplaza umbral y desacopla evaluación de aprendizaje (Schultz 1997: recompensa real = señal transitoria *por encima* de lo esperado). **5 líneas que conectan nuestros químicos existentes con recompensa real.**
- **NEAT** como algoritmo propio (~300 líneas) en **Web Worker**; **librerías NN de JS: muertas** (brain.js beta 2024, synaptic sin release desde 2022) → forward-pass propio (~50 líneas).
- **Connectoma de C. elegans (302 neuronas)** como semilla opcional: grafo publicado, no inventado (OpenWorm vivo, 112 repos).
- Referencia histórica: **Polyworld (1994)** — genoma → red + morfología produjo canibalismo y mimetismo *emergentes* sin programarlo.

### Fitness endógeno (la línea que separa simulación de disfraz)
Avida/Tierra: sin puntos — el genoma codifica acceso a un recurso escaso, la muerte es el único fitness. Es la filosofía que convierte nuestro motor en «vida» en vez de «reglas disfrazadas».

---

## 3. Libros, experimentos y datasets (Línea C)

### Libros (verificados en OpenLibrary)
| Libro | Para qué |
|---|---|
| **Steve Grand — *Creation: Life and How to Make It*** (2000) | **El libro.** Tesis de Grand: fabricar vida desde química simple + autocopía. Método conceptual del proyecto. |
| Grand — *Growing Up with Lucy* (2003) | Cuerpo, sensores, embodiment. |
| Langton — *Artificial Life: An Overview* (MIT Press) | Canon de ALife. Año: NO VERIFICADO por API. |
| Holland (1975) — *Adaptation in Natural and Artificial Systems* | GA fundacional, métodos replicables. |
| Prusinkiewicz & Lindenmayer — *The Algorithmic Beauty of Plants* (1990) | L-systems → morfología procedural. |
| *PCG in Games* (Springer 2016) | Pseudocódigo de generación procedural. |

### Experimentos replicables (con código)
| Experimento | Qué demostró | Replicabilidad TS |
|---|---|---|
| **EQU / Lenski et al. 2003 (Avida)** — `github.com/mercere99/Avida` | Complejidad evolutiva dependiente de adaptación | **Alta** — usar como *validación de motor* |
| **NEAT 2002** | Evolución de topología neuronal | Alta (implementación propia) |
| **Lenia** — `github.com/Chakazul/Lenia` | Ecosistemas ricos con 400+ especies autóctonas | Media — caja de parámetros, WebGL |
| **Growing Neural CA (Distill 2020)** | Crecimiento y auto-reparación de morfología | Media |
| **Reynolds 2025 (camuflaje coevolutivo)** | Coevolución depredador-presa → fenotipos emergentes | Media — DOI verificado; 2 arXiv IDs de memoria marcados NO VERIFICADO |
| Tierra (Ray) — `github.com/bioerrorlog/Tierra` | Selección natural literal (CPU como recurso) | Media — referencia de fitness endógeno |

### Datasets descargables
| Dataset | URL / licencia | Para qué |
|---|---|---|
| **Tabla de codones NCBI** | ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi — dominio público | Nuestra traducción ADN→proteína |
| **Kazusa codon usage** | kazusa.or.jp/codon — vivo | Frecuencias reales → «salud» de genomas |
| **C. elegans connectome** | OpenWorm (112 repos) + WormAtlas (TLS falla desde nuestro entorno) | Semilla de cerebro |
| Allen Brain Atlas | portal.brain-map.org — datos abiertos con cita | Calibración neuronal (largo plazo) |
| **Reactome / BiGG** | abiertos | Red de reacciones bioquímicas (¡**KEGG tiene licencia comercial**: usar solo académico!) |
| Movebank | movebank.org — datos de etología | Tasas de comportamiento animal realistas |
| CRCNS | crcns.org — datasets neuronales | Comparar disparo simulado vs real |
| Manual C1 (PDF, archive.org) + genomes de comunidad | verificados | Formato `.gen` y 19 familias de genes |

---

## 4. Presupuesto de rendimiento (verdad numérica)

| Escenario | Cabe a 60fps |
|---|---|
| **1–10 criaturas** | **Todo**: genoma molecular, 300 neuronas, red de reacciones, metilación |
| **~50 criaturas** | Cerebro a 25–50 Hz (no cada frame), NEAT en Web Worker, `Float32Array`/typed arrays, químicos agregados |
| **Red de reacciones espacial + Lenia a pantalla completa** | **No** — fuera de alcance (WebGL aparte) |

---

## 5. Hoja de ruta propuesta (para que Lola revise y Pablo apruebe)

| Fase | Contenido | Estado |
|---|---|---|
| **F0** | Andamiaje TS+Vite, bioquímica (8 drives, 6 químicos), contratos | ✅ hecha y aprobada |
| **F1** | Cerebro v0.5 + adaptador + visuales L1 | 🔄 D1 entregada; PR #1 de lmarena revisado (esperando OK) |
| **F2 «Genoma Creatures»** | Evolucionar `registerGene` → cabeceras ricas (tipo, `switchontime`, flags mutable/dupable/notexpressed, mutabilidad 0–255), genes críticos protegidos, mutación puntual + duplicación/omisión | Propuesta |
| **F3 «Semántica genética»** | Los químicos dejan de significar «hambre» en código: receptores/emisores genéticos asignan significado; reacciones en formato `iA+jB→kC+lD`; envejecimiento químico por etapas | Propuesta |
| **F4 «Capa molecular»** | Codones reales (`Uint8Array`), mutaciones sinónimas, promotor + metilación | Propuesta |
| **F5 «Cerebro neuronal»** | Izhikevich + STDP + neuromodulación dopamina O(1) sobre el contrato `IBrain` (el v0.5 encapsulado sigue siendo descartable); connectoma C. elegans opcional; NEAT en Worker | Propuesta |
| **F6 «Evolución endógena»** | Reproducción con mutación real, fitness sin puntos (Avida/Tierra), reto **EQU como validación** de que la evolución funciona | Propuesta |

Cada fase: rama propia → typecheck+tests+build en verde → revisión CEO → merge con OK de Pablo.

---

## 6. Aprendizajes no negociables (los 8)

1. **Mutation-proof:** toda mutación debe seguir siendo válida (lección SVRules — gramáticas tolerantes, nunca mutar código fuente).
2. **Genes críticos protegidos**, mutar sus duplicados — ahí nace la rareza deseable.
3. **Químicos sin semántica:** la genética manda; el código nunca etiqueta «hambre».
4. **Refuerzo de vida media corta** (≈ el bucle de 3 pasos): lo que hacía *vivo* al Norn. Nada de backprop.
5. **Fitness endógeno**, no puntos.
6. **Envejecimiento químico por etapas**, no timers ni telómeros.
7. **Presupuesto:** 1–10 criaturas = playground total; diseñar para ahí, no para 50.
8. **No inventar lo que ni Creatures hizo** (ADN molecular, «hígado») — salvo la capa molecular, que hoy es barata y aporta mutaciones reales.

---

## 7. Qué NO se pudo verificar / limitaciones

- `grand96creatures.pdf` bloqueado por el proxy de egress → reacciones citadas por cita secundaria del wiki.
- Docs oficiales C3/DS solo vía Wayback; el propio wiki avisa de que la doc técnica GEN oficial es «extremely inaccurate».
- Nº exacto de genes de C1/C3; nombres de órganos; algoritmo de herencia paso a paso; Void Terrarium (sin Wikipedia).
- Benchmarks de simulación biológica en navegador: no existen publicados — los números de §4 son estimaciones de la línea B, marcadas como tales.
- `web_search` (DuckDuckGo) caído gran parte de la sesión; evidencia vía APIs directas (OpenLibrary, Crossref, arXiv, NCBI, Wikipedia, GitHub).

## 8. Fuentes principales (por línea)

- **A (arqueología):** creatures.wiki/Genome · /GEN_files · /Genetics · /Mutation · /Biochemistry · /Brain · /Reinforcement · /Ageing · /Disease · Wikipedia `Creatures_(video_game_series)`, `Creatures_(1996_video_game)` · `Spore`, `Avida`, `Tierra`, `Niche`, `OpenWorm` — todas consultadas 12-oct-2026.
- **B (ciencia):** Wikipedia `Genetic_code` · Izhikevich 2003 (DOI verificado vía Crossref: `10.1109/tnn.2003.820440`) · Schultz 1997 (DOI verificado: `10.1126/science.275.5306.1593`) · NEAT (DOI verificado: `10.1162/106365602320169811`) · Distill Neural CA (https://distill.pub/2020/growing-ca/, vivo; DOI de Crossref NO ENCONTRADO) · OpenWorm.
- **C (libros/datos):** OpenLibrary (Grand ×2, Holland, Langton, Prusinkiewicz) · `mercere99/Avida`, `Chakazul/Lenia`, `bioerrorlog/Tierra` · NCBI genetic code tables · Kazusa · Reactome/BiGG · Movebank · CRCNS.

---

*Documento de coordinación generado por DinoPablo (OpenClaw). Pendiente de revisión: Lola (CEO) y Pablo. Decidir fases y reparto antes de tocar F2.*
