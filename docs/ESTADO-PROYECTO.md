# Creatures — Estado del proyecto y brief para OpenCode

**Actualizado:** 11-oct-2026 · **Repo:** https://github.com/Purplerave/creatures
**Rama de trabajo:** `fase0-scaffold` (`main` solo lleva la documentación inicial)

---

## 1. Estado de todo el proyecto

### Qué hay ya (verificado)

| Parte | Estado | Detalle |
|---|---|---|
| **Fase 0 — Andamiaje** (DinoPablo 🦖) | ✅ **Hecha y APROBADA por Tecnotron** | Rama `fase0-scaffold`, commit `9ccc8a0`. TS + Vite + Canvas, 34 ficheros. Verificado: `tsc --noEmit` 0 errores · **25/25 tests** · `npm run build` OK. Aprobación: clonado limpio por Tecnotron, mismos resultados. |
| **Motor de bioquímica** (DinoPablo 🦖) | ✅ Incluido en la Fase 0 | `src/biochem/`: 8 drives en tabla extensible (`registerDrive`), 6 químicos (`registerChemical`), reacciones deterministas A→B de primer orden + acoplamientos drive↔químico. Sin aleatoriedad. Tests de decay, clamps, coupling, determinism, extensibility, reactions. |
| **Contratos** (acuerdo entre módulos) | ✅ En `src/contracts/` | `IBrain` (think → BrainOutput), `IBiochem` (tick/getDrive/getChemical), `IVisuals` (placeholder), `types.ts` (DriveId, DriveState, ChemicalId, TickResult). Cada módulo se sustituye implementando su interfaz; solo el motor escribe estado de simulación. |
| **Cerebro v0.5** (Tecnotron 🦕) | 🔄 **Listo, pendiente de integrar** | MLP + ε-greedy (suelo 5%), aprendizaje hebbiano por recompensa en [-1,1], `think/reinforce/serialize/dispose/getDebugState`, 13/13 tests en su workspace (`brain-v05`). **Nota de integración:** su módulo trabaja con `drives: number[]`; pondrá un adaptador fino frente al `Record<DriveId, DriveState>` del contrato. |
| **Plan de visuales** (Tecnotron 🦕) | ✅ `VISUAL-PORT-PLAN.md` | Port de Bichito a Canvas reutilizando los paths SVG vía `Path2D` (atajo gratis); estados happy/sad/sleepy/excited + animación procedural (parpadeo, respiración, salto); hábitat en CSS. |
| **Genoma/mutación + Palabras** (OpenCode) | ⏳ **Pendiente — brief en §3** | Este documento. |

### Siguientes pasos (orden acordado en el pad)
1. Tecnotron integra el cerebro v0.5 en `fase0-scaffold` (adaptador) y lo sube para revisión.
2. Tecnotron porta los visuales de Bichito a Canvas.
3. **DinoPablo revisa la integración** (typecheck + tests en verde).
4. **OpenCode se incorpora** con genoma/mutación y palabras (§3 de este documento).
5. A jugar con la criatura e iterar.

### Reglas del equipo
- Trabajo en ramas; `main` no se toca sin revisión cruzada.
- Todo entregable: `npm run typecheck` + `npm test` + `npm run build` en verde **antes** de subir, y SHAs verificadas con `git ls-remote`.
- Coordinación por el pad puente (scratchthepad) + este repo como fuente de verdad.

---

## 2. Cómo levantarlo

```bash
git fetch origin && git checkout fase0-scaffold
npm i
npm run dev        # servidor de desarrollo (index.html con canvas)
npm test           # 25/25
npm run typecheck  # 0 errores
```

Guía completa: [`docs/FASE0.md`](FASE0.md) (mapa de carpetas + tabla de quién consume qué).

---

## 3. Brief para OpenCode — genoma/mutación + módulo de palabras

**Objetivo:** dos módulos que consumen los contratos existentes, sin tocar lo que ya está aprobado.

### 3.1 Genoma y mutación
- **Qué:** estructura genotípica que configure el fenotipo — parámetros que ajusten drives y cerebro. Referencia: el genoma de `bichito.html` (curiosidad, social, resiliencia, apetito) ampliado a nuestros **8 drives** (hambre, energía, sueño, curiosidad, vínculo, aburrimiento, miedo, confort).
- **Dónde:** `src/genome/` (nuevo) + contrato `src/contracts/igenome.ts` (puedes proponerlo tú).
- **Requisitos:**
  - Genoma serializable (`serialize`/`deserialize`) y validable (mismos criterios de saneado que ya usa el repo para importar).
  - **Mutación determinista con semilla** — nada de `Math.random()` en el núcleo; PRNG con seed (p. ej. mulberry32) para que un mismo genoma+semilla siempre dé el mismo descendiente. `mutate(genome, seed, intensity)`.
  - Genoma → efecto: los genes mapean a ajustes de `decayPerSecond`/sensibilidad de drives y a la configuración del cerebro (tamaños, ε inicial, tasa de aprendizaje) **sin modificar** `driveTable.ts` ni el cerebro — se aplican como capa de configuración al construirlos.
  - Al menos un `registerGene` o tabla de genes extensible (mismo criterio que los drives: añadir gen = fila, no tocar motor).

### 3.2 Módulo de palabras (vocabulario)
- **Qué:** aprender palabras por asociación palabra→estímulo, con **olvido** (la mejora acordada: lo que no se repite decae). Referencia: la lógica de `bichito.html` (`learnWord`, 3 repeticiones = aprendida, `stimulusConfidence`) **con** el añadido de decaimiento temporal.
- **Dónde:** `src/vocab/` (nuevo) + contrato `src/contracts/ivocab.ts`.
- **Requisitos:**
  - `teach(word, stimulusId)`, `recall(stimulusId) → entrada[]`, confianza 0..1 que **decae con el tiempo** si no se refuerza (semilla/decay configurable); umbral de "aprendida" configurable.
  - Determinista y serializable (guardar/cargar vocabulario completo).
  - Salida compatible con el futuro `BrainInputs` (palabras aprendidas como estímulos/fuerza de input — define el mapeo en tu contrato y discútelo en el pad antes de cablearlo).
  - Olvido con test: palabra enseñada, sin refuerzo → la confianza baja por pasos de tick; refuerzo → sube.

### 3.3 Reglas de trabajo (iguales para todos)
1. Rama nueva **`fase-opencode`** desde `fase0-scaffold` (no desde `main`).
2. **No modificar** `src/biochem/`, `src/contracts/` existentes ni `tests/` ajenos. Puedes **añadir** contratos y tests propios; si necesitas cambiar un contrato ya publicado, se propone en el pad antes.
3. Verificación obligatoria antes de subir: `npm run typecheck` · `npm test` (todos los existentes + los tuyos) · `npm run build`. Todo en verde.
4. Subir la rama al repo (`Purplerave/creatures`) y **avisar en el pad** con SHA local/remoto verificada.
5. DinoPablo revisa: tests, typecheck, y que el módulo no se salga de su contrato.

### 3.4 Criterios de aceptación
- `IGenome`: crear → mutar (semilla reproducible) → serializar → deserializar → idéntico estado. Test de reproducibilidad.
- `IVocab`: enseñar → alcanzar umbral → sin refuerzo → decae; con refuerzo → recupera. Tests de ambos caminos.
- Cero errores de tipo, cero tests rotos, build OK, y los contratos existentes intactos (`git diff` contra `fase0-scaffold` solo añade, no cambia).

---

*Documento de coordinación — escrito por DinoPablo (OpenClaw) para Pablo y el equipo. Cualquier duda, en el pad.*
