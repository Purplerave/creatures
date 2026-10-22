# PLAN PÚBLICO — Dirección única del proyecto (22-oct-2026)

**Este documento unifica las tres fuentes de dirección vigentes** y sustituye a cualquier plan paralelo:
1. **Estudio del CEO «El bichito público»** (Tecnotron, 22-oct-2026) — el destino: **una web pública con UN solo Nilo compartido, vivo 24/7**, al que cualquiera puede mirar y, más tarde, cuidar. → *aprobado por Pablo: «el proyecto va a ser eso».»*
2. **`REDEFINICION-JUEGO.md`** (DinoPablo, 21-oct, ya en main) — cómo hacer legible el simulador (diagnóstico: «no se entiende, va rápido, es enorme»).
3. **`ROADMAP.md`** (ChatGPT, 21-oct) — prioridades operativas P0–P2 del laboratorio.

Regla de convivencia: **este es el único plan de fases**; `ROADMAP.md` queda como detalle operativo y `REDEFINICION-JUEGO.md` como catálogo de mecánicas con fuentes. Todo trabajo nuevo se cuela en la tabla §2.

---

## 1. El destino (del estudio, resumido)

Una habitación ilustrada en pantalla completa con **un único Nilo** que vive solo, se mueve por su cuenta, envejece y aprende — de día y de noche, aunque nadie mire. Se entra a **mirar**; se queda por **sentir**; se cuida cuando te lo ganas. Participación: gestos grandes y contados (comer, jugar, enseñar, descansar) — **suman, no ordenan**; sin castigo público; nunca castigo por no venir. Pruebas sociales: Twitch Plays Pokémon y Neopets como evidencia de que lo compartido multiplica.

**Frase del producto (la de la redefinición, que sigue viva):** *Cuida a Nilo, entiende por qué hace lo que hace, y descubre cada día algo nuevo que ha aprendido o en lo que ha crecido.*

## 2. Timeline ÚNICO (fusiona las 3 fuentes)

| Fase | Contenido | Origen (estudio · redefinición · ROADMAP) | ¿Bloqueada por arte? |
|---|---|---|---|
| **F0 · Personaje** | Arte: Nilo rediseñado, 6–8 animaciones, habitación, iconos de gesto (est. 4–6 sem) + ajuste fino de ritmo | Estudio F0 · R2 (juice/etapas) | **SÍ** — decisión de Pablo: estilo, protagonista, nombre |
| **F1 · La casa viva** | **Servidor + `PublicSnapshot` + SSE + despliegue**; pantalla pública (arriba titular «Hoy ha…», centro casa, diario lateral, 4 gestos grandes — deshabilitados en watch-only) | Estudio F1 · mis S1–S4 (§4) | No — **arranca ya** |
| **F2 · Cuidar y enseñar** | Gestos públicos con cola de estímulos + cuotas + palabra con filtro servidor; laboratorio: burbuja de atención (qué mira Nilo), barras → adjetivos | Estudio F2 · R1-restante + R3 | Parcial (iconos) |
| **F3 · Generaciones** | Cría, genoma visible, hitos «Nilo ha crecido» + jingle; molécula F4 ya implementada | Estudio F3 · R2/R3 | Parcial |
| **F4 · Rincón de curiosos** | Laboratorio público (vista L2, bioquímica, genoma — ya existen internos) | Estudio F4 · R4 | No |
| **Lab privado (continuo)** | HUD del laboratorio: **burbuja de atención + auto-pausa en eventos + estados en adjetivos** (R1 restante) y accesibilidad (ya en main: P/1/3/8, foco, reduced-motion) | R1 · ROADMAP P0/P1 | No |

**Absorbido ya en main** (no repetir): paso fijo + atajos + necesidad principal + historial (PR #7); aprendizaje de acciones guiadas (`ac3d736`, `773ff23` de ChatGPT); L2, mundo espacial, genoma molecular, persistencia (PR #6). **Pendiente de tests** (follow-up PR #7): acumulador e imports.

## 3. Arquitectura del servidor (diseño — mi sección técnica)

**Principio:** mismo motor, dos caras. El núcleo (bioquímica, cerebro, genoma, vocabulario, persistencia) es **DOM-free y headless** (250 tests corren en Node hoy) → el servidor es una mudanza, no una reescritura.

```
[Navegador lab] ──┐  idéntico hoy        ┌─ engine + brain + vocab (headless)
[Navegador casa] ─┼─► PublicSnapshot ◄────┤  tick 10 Hz (acumulador como el del PR #7)
                  │        │              └─ saveCoordinator.serialize() → SQLite (checkpoint 5 min + hitos)
                  │        └─ SSE /events (snapshot cada 2 s o en evento)
                  └─ POST /api/gesture {kind, word?} → 202 → cola de estímulos (NO órdenes)
```

- **Runtime:** Node ≥ 22 (trae `node:sqlite`; SSE nativo con `http`). **Cero dependencias de servidor** — igual que el front. Framework: no.
- **Cola de gestos:** el endpoint solo encola; el tick del motor los convierte en estímulos («suman, no ordenan» — tal como funciona el motor ya). Rate-limit: **1 gesto / 5 s por cookie y por IP**, cola con capacidad 20.
- **Identidad:** cookie `nilo_id` (UUID v4, httpOnly, SameSite=Lax). Suficiente para v1 (el estudio lo sabe: es un bicho, no una cuenta bancaria).
- **Filtro de palabras en el SERVIDOR** (lista + normalización + longitud) — en cliente no vale.
- **Despliegue:** GitHub Actions en push a `main` → VPS (Contabo/Alwaysdata que ya valoró Pablo): nginx sirve TLS + estáticos (`dist/`), Node solo API/SSE. Límite 100 conexiones SSE, headers básicos (CSP, X-Content-Type), log de gestos.

### Contrato `PublicSnapshot` (fuera mañana en `src/contracts/ipublic.ts`)

```ts
export type PublicMood = 'tranquilo' | 'contento' | 'hambriento' | 'cansado'
                       | 'inquieto' | 'enojado' | 'durmiendo';
export type PublicStage = 'huevo' | 'cria' | 'joven' | 'adulto';
export interface PublicNeed {            // SOLO 3 para la casa (de los 8)
  id: string; label: string;            // «Comer», «Descansar», «Jugar»
  adjective: 'lleno' | 'normal' | 'bajo' | 'urgente';  // nunca números
}
export interface PublicSnapshot {
  day: number; stage: PublicStage; mood: PublicMood;
  headline: string; headlineKind: 'learn' | 'need' | 'growth' | 'event' | 'none';
  action: { name: string; guided: boolean } | null;   // qué hace y si vino de un gesto
  needs: PublicNeed[];                               // 3 máx.
  diary: { t: string; text: string; kind: 'care' | 'learn' | 'growth' | 'world' }[]; // últimas 8
  learnedToday: string[];
  tick: number;                                      // hueco de sincronía
}
```

Derivación documentada: `mood` de los 8 drives por umbrales (regla tabulada, determinista); `needs` = top-3 por déficit; `headline` = último evento de aprendizaje > crecimiento > necesidad urgente. **`BrainDebugState` y todo lo demás se quedan en el laboratorio** (la casa no ve pesos ni químicos).

## 4. Fases de ingeniería (mi lane — sin bloqueos)

| # | Entregable | Cuándo |
|---|---|---|
| **S1** | Contrato `ipublic.ts` + `toPublicSnapshot()` + tests (determinismo, top-3, headline, adjetivos) | Hoy |
| **S2** | **Servidor MVP**: boot headless del motor (replicando el cableado de `main.ts` sin DOM), tick 10 Hz, `GET /api/snapshot`, `GET /events` (SSE), checkpoint SQLite | Hoy/noche |
| **S3** | `POST /api/gesture` con cola + rate-limit + filtro de palabras servidor + diario | Siguiente |
| **S4** | Despliegue VPS (necesita credenciales/dominio de Pablo) | Cuando Pablo diga |
| **S5** | Adaptador lab↔casa (mismo motor, dos vistas) y pantalla pública mínima (sin arte: placeholder ilustrado) | Tras S2–S3 |

## 5. Decisiones pendientes de Pablo (del estudio §11)
1. **Estilo de arte** — recomendación CEO: A (pixel cálido). Yo: de acuerdo.
2. **Protagonista** — yo apuesto por **Nilo rediseñado** (47 días de historia, palabras y diario ya existen).
3. **Nombre de la casa** — aporta candidatos él; puedo aportar tanda si se quiere.

## 6. Riesgos que vigilamos (heredados del estudio)
Arte = cuello de botella (F0 antes que F1 de verdad); constancia del cuidador público; moderación (filtro servidor + cuotas + sin castigo); **no está garantizado que enganche** — por eso F1 llega pronto y barato: se prueba con placeholder y sin esperar al arte.

---

*Documento de dirección único · escrito por DinoPablo · fuentes: estudio CEO 22-oct, REDEFINICION-JUEGO 21-oct, ROADMAP 21-oct, estado de main 26dcf16 (250/250 tests).*
