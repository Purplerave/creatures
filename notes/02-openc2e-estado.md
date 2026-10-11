# Notas sección 2: estado de openc2e

## Fuentes
- https://github.com/openc2e/openc2e (README, leído 2026-10-11, index)
- https://github.com/openc2e/openc2e/commits (verificado EN VIVO con navegador 2026-10-11)
- https://github.com/thechimpmatrix/openc2e-nb (README: nota de licencia)

## Actividad — verificado en vivo 2026-10-11
- Commits recientes (autor: ligfx): 15-may-2026 (migración SDL2→SDL3, SDL3_mixer, SDL3_native_midi), 7-may-2026 (fixes openc1, CAOS c_SPIN), 30-abr-2026 (openc1 rendering/sonido), 17-nov-2025, 4-feb-2025 (serialización criaturas openc1, WIP animación).
- Estado: ACTIVO, aunque con un solo mantenedor principal (ligfx). Hay subproyecto "openc1" (reimplementación del motor de Creatures 1) en desarrollo activo.

## Qué reimplementa (según su README)
- Objetivo: jugar a Creatures (1996), Creatures 2, Creatures 3, Docking Station, Playground, Adventures en múltiples plataformas.
- Funciona: agentes (COBs), física imperfecta, bioquímica de criaturas, efectos de sonido, motor CAOS, cerebro SVRule.
- Pendiente (TODO oficial): criaturas reales — C3+ "funcionan algo", C1/C2 no funcionan en absoluto; mejoras de física; red (warp de DS); serialización (guardado de mundo, exportación de criaturas).
- 22 issues abiertos.

## Licencia y recursos
- Licencia: GNU LGPL-2.1 (confirmado por el fork openc2e-nb: "Inherited from upstream openc2e: GNU Lesser General Public License, version 2.1 (see COPYING)").
- Necesita los ficheros de datos originales del juego: se ejecuta con --data-path /ruta/al/juego. Los assets (sprites, sonidos, genomas, CAOS bootstrap) son propietarios de Gameware Development / Creature Labs; NO incluidos.
- Vía legal: comprar el juego (p. ej. la reedición "Creatures Exodus" en Steam, usada por nornbrain como data-path).
- El código fuente original de C3 (1999) circula en Internet Archive (creatures-3-1999-cyberlife-source-code) y en github.com/videogamepreservation/creatures3, pero SIN licencia explícita: openc2e lo considera propietario y no puede usarlo (clean-room). Citado en issue openc2e #197.
- Traducciones/ports (p. ej. pocketbuddyplus portó la química a TypeScript) son derivados LGPL y deben mantener la licencia.
