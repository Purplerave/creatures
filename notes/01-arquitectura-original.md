# Notas sección 1: arquitectura del Creatures original

## Fuentes
- https://github.com/thechimpmatrix/nornbrain/blob/HEAD/docs/reference/svrule-brain-complete-reference.md (leída 2026-10-11, index; referencia verificada contra código fuente C3 1999)
- https://github.com/ugwun/creatures3-engine-port/blob/HEAD/tools/docs/genome_deep_dive.md (leída 2026-10-11, index)
- https://github.com/ugwun/creatures3-engine-port/blob/HEAD/tools/docs/drives_and_learning.md (index, vía búsqueda)
- https://creatures.fandom.com/wiki/GEN_files (index)
- https://creatures.fandom.com/wiki/CAOS (index)
- Paper Grand & Cliff "Creatures: Entertainment Software Agents with Artificial Life" (vía mirror https://0.comy.workers.dev:443/https/www.cp.eng.chula.ac.th/~vishnu/gameResearch/AI/creatures.pdf)

## Genoma (fichero .gen)
- Cabecera "dna3" (C3) / "dna"+"2" (C2); C1 sin cabecera. Genes: marcador "gene" + header + datos; fin "gend". Little-endian.
- Header (12 bytes con marcador): tipo (0=Brain, 1=Biochemistry, 2=Creature, 3=Organ), subtipo, ID, generación, switch-on (etapa vital), flags, mutabilidad (0-255), variant (C3).
- Flags: MUT (0x01), DUP (0x02), CUT (0x04), LINKMALE (0x08), LINKFEMALE (0x10), MIGNORE (0x20, gen dormido).
- Switch-on: 7 etapas (baby 0, child, adolescent, youth, adult, old, senile 6). SWITCH_EMBRYO protege genes cerebrales críticos.
- Genoma típico: 200-350 genes, 19 subtipos. Genoma haploide (mitad genética de cada padre, recombinación con linkage por distancia).
- Subtipos cerebro: Lobe (121 bytes: nombre 4 chars, updatetime u16, X/Y u16, W×H u8, RGB, WTA, tissue, init-always, 7 pad, init SVRule 48B, update SVRule 48B), Brain Organ (5 bytes), Tract (128 bytes).
- Subtipos bioquímica: Receptor (8B: órgano, tejido, locus, químico, umbral, nominal, ganancia, flags), Emitter (8B: ... rate, ganancia, clear-source), Reaction (9B: 2 reactivos→2 productos + rate), Half-Lives (256B), Initial Concentration (2B), Neuroemitter (15B: hasta 3 pares lóbulo/neurona→4 químicos).
- Subtipos criatura: Stimulus (13B: evento, significancia, input, intensidad, flags, 4 ajustes químicos con signo), Genus (65B: género + monikers padres), Appearance, Pose, Gait, Instinct, Pigment, Pigment Bleed, Expression.
- Tipo órgano: Organ (hasta 128 órganos; clock rate, damage rate, life force).

## Cerebro SVRule
- C1: ~952 neuronas en 9 lóbulos (perception 112, drive 16, stimulus source 40, verb 16, noun 40, general sense 32, decision 16, attention 40, concept 640), ~5000 dendritas. Valores uint8.
- C3: floats 32-bit; tractos arbitrarios entre lóbulos en vez de tipos fijos.
- Neurona C3: 8 floats (0 STATE_VAR, 1 INPUT_VAR, 2 OUTPUT_VAR, 3-6 general, 7 NGF_VAR) + acumulador input.
- Dendrita C3: 8 floats; [0]=STW, [1]=LTW, [7]=STRENGTH (0 = suelta, elegible para migración).
- SVRule: 48 bytes = 16 instrucciones × 3 bytes (opcode 0-68, tipo operando 0-15, dato). Máquina de registros con acumulador; saltos solo hacia adelante; toda mutación es sintácticamente válida (diseño evolutivo deliberado).
- Tick: componentes ordenados por updatetime; tractos antes que lóbulos (1 tick de retardo); tras procesar, input=0.
- Aprendizaje: dinámica bidireccional STW↔LTW (olvidar hacia LTW; consolidar LTW hacia STW). Refuerzo vía químicos 204 (reward) / 205 (punishment) — corrección: NO 49/50.
- Migración dendrítica: dendritas sueltas se reconectan a neuronas con mayor NGF (var[7] según srcvar/destvar del gen).
- WTA: mecanismo "spare neuron" (opcode 31). attn winner = categoría de objeto; decn winner = acción → evento CAOS 16+índice.
- Instintos: genes que simulan "soñar" (químicos 212 pre-REM / 213 REM): resetean lóbulos, fijan inputs y refuerzo (level-128)/128, dejan que las SVRules normales ajusten pesos. No fijan pesos directamente.
- Integración química: operandos tipo 7 leen químicos en SVRules; receptores inyectan drives al lóbulo drive; neuroemisores convierten actividad neuronal en químicos (ej: ver un Grendel → adrenalina/miedo).
- Pipeline decisión: sensorial → tractos → concept (AND) → attention (WTA) → decision (WTA) → motor ejecuta script CAOS del evento 16+acción sobre el agente atendido más cercano.

## Bioquímica
- 256 químicos, concentraciones 0-1, decaimiento por half-life (byte por químico; 0=decae instantáneo, 255=casi permanente). Órganos con clock rate propio procesan reacciones/emisores/receptores.
- Reacción: A+B→C+D, con amounts y rate.
- Drives 0-19 ↔ químicos 148-167: 0 dolor, 1 hambre-proteína, 2 hambre-carbo, 3 hambre-grasa, 4 frío, 5 calor, 6 cansancio, 7 sueño, 8 soledad, 9 agobio, 10 miedo, 11 aburrimiento, 12 ira, 13 libido, 14 confort, 15-19 navegación (up/down/exit/enter/wait).

## CAOS
- Lenguaje de scripting basado en registros, opcodes de 4 letras con listas fijas de argumentos. Scripts = bloques identificados por 4 enteros (genus, species, family, evento).
- 100 registros VAxx, 100 OVxx por objeto, registro especial TARG (objeto objetivo por defecto) y owner.
- Eventos: temporizados, colisiones, clicks, etc. Agentes en COB (C1/C2) o PRAY/COS (C3+). C1/C2: enteros byte sin signo; C3/DS: int32 + floats.
