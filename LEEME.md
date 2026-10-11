# Proyecto «Bichito» — sucesor moderno de Creatures (1996)

Paquete de documentación completa del proyecto. Preparado el 2026-10-11 para el equipo
(Tecnotron, DinoPablo, OpenCode y otras IAs).

## La idea

Crear una criatura virtual web estilo *Creatures* (Creature Labs, 1996): red neuronal,
ADN digital, necesidades, aprendizaje por premios/castigos, enseñarle palabras,
nuevas generaciones con genoma mutado, exportar/importar estado.

**No es un producto vendible: es por puro disfrute.** Lo que fascinaba del original
era ver que las criaturas aprendían. Con IAs programando, los tiempos se comprimen
muchísimo frente a las estimaciones a ritmo humano.

## Qué hay en este paquete

| Archivo | Contenido |
|---|---|
| `bichito.html` | El proyecto actual: la criatura funcional en un solo HTML. Ábrelo en el navegador. |
| `estudio-proyecto-creatures.html` | Página de estudio: anatomía del juego original, estado de openc2e/NORNBRAIN, enfoques modernos, comparación de arquitecturas, recomendación y **hoja de ruta por fases**. |
| `estudio-creatures-revision-claude.md` | Documento del estudio preparado para revisión por Claude. |
| `report.md` | Investigación técnica profunda (2026-10-11): genoma, cerebro SVRule, bioquímica, CAOS, openc2e y forks, técnicas modernas de aprendizaje/neuroevolución viables en JavaScript, alternativas de arquitectura y hoja de ruta. |
| `notes/` | Notas de la investigación por bloques: arquitectura original, estado de openc2e, nornbrain/openc2e-nb, enfoques modernos. |

## Hacia dónde queremos llevarlo (ampliación en curso)

- Más grande y complejo, como el *Creatures* original.
- Que aprenda con estímulos (premios/castigos).
- Que juegue con la pelota.
- Enseñarle palabras.
- Nuevas generaciones con genoma mutado.
- Exportar/importar el estado de la criatura.

## Recomendación técnica (del estudio)

Reimplementación web simplificada desde cero, tomando el diseño de *Creatures* como
especificación: genoma estructural + cerebro neuronal con aprendizaje hebbiano por
refuerzo + bioquímica de drives/necesidades, modernizando el cerebro (p. ej. red
líquida CfC o MLP pequeño con aprendizaje por refuerzo de drive-reduction) en lugar
de clonar las SVRules al detalle.
