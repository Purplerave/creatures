# REDEFINICIÓN — «Nilo, el juego» (21-oct-2026)

**Por qué existe este documento:** Pablo probó la demo y su diagnóstico fue claro: *«ves un muñeco moverse y no entiendes nada; no sabes qué hace, qué aprende, ni qué puedes hacer tú; va súper rápido; es enorme»*. Este documento redefina el producto a partir de **2 líneas de investigación** (diseño de mascotas digitales · ritmo/legibilidad/progresión), ejecutadas el 21-oct-2026 con fuentes verificadas. Pendiente de aprobación de Pablo (presidente) y Lola/Tecnotron (CEO).

---

## 1. Diagnóstico verificado

1. **Creatures (1996) ya tenía toda la información… y aun así no se entendía.** Su fallo no fue de datos sino de *descubribilidad*: la respuesta estaba en 6+ paneles y en un «modo ayuda» que había que saber que existía. Lección: **la capa del «por qué» va a la vista, no escondida.**
2. **FTUE (nastyrodent playbook, 21-oct):** «un jugador que no sabe si su primera acción funcionó no gana confianza — gana confusión… se resuelve con feedback (animación, sonido, cambio de UI), no con más texto». Y el HUD debe tener **llegada secuenciada**: *suppress-until-needed* — la bioquímica/genoma no van en pantalla 1.
3. Nuestro problema tiene **soluciones documentadas 1:1** (tabla §3).

## 2. La redefinición

> **En una frase:** *Cuida a Nilo, entiende por qué hace lo que hace, y descubre cada día algo nuevo que ha aprendido o algo en lo que ha crecido.*

**El bucle (sesión de 3–5 minutos):**
**Mirar** (con reloj controlado) → **Actuar** (comer/jugar/enseñar → respuesta inmediata con juice) → **Entender** (burbuja: qué hacía y por qué + barra que se mueve) → **Hitó** (palabra aprendida / etapa subida / truco nuevo — el juego se pausa y lo celebra).

**Lo que NO es (todavía):** no es un panel de diagnóstico ni un sandbox de bioquímica — esa profundidad existe y sigue ahí, detrás de pestañas, para cuando el jugador la pida (*pull*, no *push*).

## 3. Los cambios, por valor/esfuerzo (catálogo con fuentes)

| # | Cambio | Ataca qué | Fuente verificada |
|---|---|---|---|
| 1 | **Reloj: ⏸ pausa (espacio) + ×1 por defecto + ×2/×3** | «va súper rápido» | Patrón canónico Sims/RimWorld/Frostpunk *(detalle de teclas NO VERIFICADO — suficiente por consenso)* |
| 2 | **Auto-pausa en eventos** (eclosión, palabra aprendida, subida de etapa) — el juego se para y lo muestra | «no sabes si crece/aprende» | Unión de patrón pausa + hitos (Dwarf Fortress auto-pausa *(NO VERIFICADO)*; Sims 4 etapas comunicadas ✅) |
| 3 | **Burbuja de atención:** marca sobre lo que Nilo **mira** + su acción elegida («voy a comer la semilla») | «no entiende qué hace» | **Creatures: flecha verde = objeto mirado, roja = sujeto** (roundtablenorns, 21-oct ✅) — ya tenemos `BrainDebugState.actionName/explored` para esto |
| 4 | **3 barras con nombre plano + 1 icono de alarma** (comido · alegre · activo; 🤒 si algo va mal) | «es enorme» | Tamagotchi: Hunger/Happy/Training + calavera (Wikipedia ✅) |
| 5 | **Estados en 4 adjetivos, no números**: *Lleno/Normal/Con hambre/Pasando hambre* | legibilidad | Nintendogs: Full/Normal/Hungry/Famished (Wikipedia ✅) |
| 6 | **Precursor animado**: Nilo se inquieta X s **antes** del problema (gesto antes de fallar) | «no entiende qué pasa» | Tamagotchi: «stink lines» antes de hacer del baño (Wikipedia ✅) |
| 7 | **Juice en cada acción:** texto flotante (+comido), partícula, sonido, shake sutil | «no se siente jugable» | *Juice It or Lose It* (GDC Vault 1016487 ✅) |
| 8 | **Una sola barra de crecimiento** con etapa actual → próxima (huevo→cría→joven→adulto) + jingle y rediseño al subir | «no sabes si crece» | Tamagotchi (jingle+cambio de sprite ✅) · Sims 4: 8 etapas nombradas ✅ |
| 9 | **UI en modos: Ver · Cuidar · Cerebro · Genoma** — un panel a la vez; lo profundo detrás de ayuda *pull* | «es enorme» | Sims 4: CAS/Build/Gameplay, items bloqueados hasta progresar ✅ + FTUE suppress-until-needed ✅ |
| 10 | **Toast de aprendizaje con causa:** «Nilo ha aprendido **X porque** hizo Y» + colección enumerable de palabras/trucos (sin aprender/en progreso/dominado) | «¿aprende o no?» | XAI en juegos: arXiv 2508.14201 (vista de saliencia ✅), TTIR arXiv 2007.15236 ✅ · Nintendogs trucos ✅ |

Mención especial: **doble indicador barra-actual vs objetivo-instantáneo con umbrales** (RimWorld Mood ✅ — el «por qué» con aritmética visible: causa con signo a un clic). Es la pieza grande para «sé exactamente por qué se movió así».

**Ética (decisión de diseño):** notificaciones *bright patterns* — opt-in, silencio nocturno, nunca FOMO ni penalización por ausencia (arXiv 2104.12653 ✅ · dark patterns medidos en 1.496 juegos: arXiv 2412.05039 ✅).

## 4. Fases propuestas (reparto a acordar con la CEO)

- **R1 · «Se entiende» (lo inmediato):** reloj pausa/velocidades + auto-pausa de eventos + burbuja de atención (consumiendo `BrainDebugState`, ya existe) + renombrar las barras a 4 adjetivos. *Es trabajo sobre UI y bucle principal — yo puedo cogerlo hoy.*
- **R2 · «Se siente»:** juice (partículas/sonido/texto flotante) + precursor animado + barra de etapas con celebración.
- **R3 · «Se juega»:** modos de UI (Ver/Cuidar/Cerebro/Genoma) + doble indicador RimWorld + colección de palabras/trucos con toasts de aprendizaje.
- **R4 · «Vuelve mañana»:** sesión corta + «3 cosas que pasaron mientras no estabas» + notificaciones éticas.

Cada fase: rama propia → typecheck+tests+build en verde → revisión → merge con OK de Pablo. **Pantalla objetivo de R1:** cualquiera abre la demo y en 10 segundos sabe: qué es (Nilo), qué necesita (3 barras), qué hace él solo (burbuja) y qué puedes hacer tú (3 botones grandes).

---

*Fuentes: Wikipedia API (Tamagotchi, Nintendogs, Creatures/Sims4/Frostpunk/Dwarf Fortress), roundtablenorns.blogspot.com, nastyrodent FTUE playbook, GDC Vault 1016487, rimworldwiki.com, arXiv 2508.14201 · 2007.15236 · 2412.05039 · 2104.12653 — todas consultadas el 21-oct-2026. Lo no confirmado está marcado NO VERIFICADO. Investigación completa: DinoPablo (2 líneas paralelas).*
