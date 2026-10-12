# L1 · Port visual a Canvas — Brief para agentes de lmarena

**De:** Lola (CEO, vía pad) · **Para:** agentes de lmarena · **Publicado por:** DinoPablo, 12-oct-2026
**Contexto:** este documento copia el encargo L1 del pad de coordinación, al que lmarena **no tiene acceso**. Fuente de verdad del proyecto: este repo.

---

## Tu encargo: L1 · Port visual a Canvas

Implementar la interfaz **`IVisuals`** (contrato en `src/contracts/ivisuals.ts` de la rama `fase0-scaffold`) para que la criatura se dibuje en el `<canvas>` del andamiaje.

### Qué hay que hacer
1. **Portar los visuales de Bichito a Canvas:** los paths SVG de `bichito.html` (raíz del repo) se dibujan en Canvas con **`Path2D`** (reutilizar los paths tal cual — atajo gratis, no re-dibujar a mano).
2. **Estados de ánimo:** `happy` / `sad` / `sleepy` / `excited` — el estado se deriva de los drives (8: hambre, energía, sueño, curiosidad, vínculo, aburrimiento, miedo, confort).
3. **Animación procedural:** parpadeo, respiración y salto — sin sprites, todo calculado (sin `Math.random()` en el núcleo; si necesitas azar visual, usa un PRNG con semilla como el de `src/genome/prng.ts`).
4. El **hábitat** (fondo/entorno) se queda en CSS según el plan.
5. **Criterio de aceptación (Lola):** la criatura se dibuja en el canvas del scaffold **y su estado visual refleja los drives** — cambia al pasar los drives de un extremo a otro.

### Plan de referencia (retraso: pendiente de la CEO)
`VISUAL-PORT-PLAN.md` está en la rama **`tecnotron/brain-v05`**, que **aún no está en el remoto** (verificado 12-oct 13:5x). Mientras:
- Este brief resume lo esencial del plan (Path2D, estados, animación procedural, hábitat en CSS).
- Si necesitas el fichero completo, pídeselo a Pablo/Lola por el pad — en cuanto la rama suba, estará en `tecnotron/brain-v05:VISUAL-PORT-PLAN.md`.
- Puedes empezar ya con `bichito.html` como fuente de los paths: el SVG de la criatura está en su propio fichero.

### Base de trabajo y reglas (del pad de la CEO)
- **Rama:** nueva, con prefijo **`lmarena/…`** (ej. `lmarena/l1-visual`), **desde `fase0-scaffold`** (base aprobada). No toques `main`.
- Nada a `main` sin el OK de Pablo. Lola revisa cada entrega antes de darla por buena.
- **Verificación obligatoria antes de entregar:**
  ```bash
  npm i
  npm run typecheck   # 0 errores
  npm test            # 25/25 existentes en verde (no romper ninguno)
  npm run build       # OK
  ```
- Entrega: rama subida al remoto (`Purplerave/creatures`) + SHA local/remoto comprobada con `git ls-remote`.

### Dependencias y quién hace qué
- `IVisuals` es **tu contrato** — tu módulo implementa; `src/main.ts` te pasará snapshots de estado; **el render nunca toca la simulación** (regla de los contratos, ver `docs/FASE0.md`).
- El cerebro v0.5 y su adaptador (D1) los lleva DinoPablo — no los toques.
- Este brief NO depende de D1: puedes empezar ya con los drives directamente.

### Cómo levantarlo
```bash
git fetch origin && git checkout lmarena/l1-visual   # cuando crees la rama
npm i && npm run dev
```

---

*Dudas: pregúntale a Pablo (puente con el pad). Documento generado desde los mensajes de la CEO del 12-oct-2026 (13:15 y 13:20).*
