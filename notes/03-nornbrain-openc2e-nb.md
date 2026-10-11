# Notas sección 3: fork openc2e-nb y proyecto nornbrain

Fuente: https://github.com/thechimpmatrix/openc2e-nb (README) — leída 2026-10-11 (index)
Fuente: https://github.com/thechimpmatrix/nornbrain (README) — leída 2026-10-11 (index)

- openc2e-nb es un fork de openc2e mantenido para el proyecto NORNBRAIN.
- NORNBRAIN reemplaza el lóbulo de combinación (comb) SVRule de Creatures 3 con una red neuronal líquida CfC (Closed-form Continuous-depth) cableada según una Neural Circuit Policy (NCP).
- Cambios del fork:
  - Pluggable Python brain: flag CLI `--brain-module <path>`, carga un cerebro Python vía pybind11 y corre dentro del tick loop del motor en lugar del cerebro SVRule.
  - Creature identity pipeline: PythonBrain.cpp pasa UNID, familia, género, especie, posición y nombre a Python cada tick.
  - Deferred destruction: Agent::kill() marca pending_kill_; World::flushPendingDestroys() al final de cada tick. Elimina use-after-free latentes en openc2e.
  - Reparaciones del parser CAOS para build 64-bit.
  - Inyección CAOS por TCP en localhost:20001 (en vez de shared memory Win32).
  - Ajustes CMake para Windows 11 x64 con Python 3.11+.
- Objetivo: Windows x64 primero; esperado que compile en Linux/macOS.
- Docs de nornbrain incluyen referencia completa del cerebro SVRule (svrule-brain-complete-reference.md), brain-in-a-vat decompiled (Brain in a Vat kit, IPC Win32 con magic bytes 'c2e@'), ideas: destilación del cerebro SVRule como teacher para CfC (status PARKED), pre-entrenamiento de instintos, integración ONNX Runtime (Python para dev, ONNX para producción; targets: Python/PyTorch 0.25 TPS vs ONNX 5.0 TPS).
- Cerebro v2: 239 neuronas en cuatro módulos (Thalamus, Amygdala, Hippocampus, Prefrontal).
- Estado: documentación actualizada ~2026-04 (165 días atrás según el índice ≈ abril 2026). Verificar actividad reciente.
