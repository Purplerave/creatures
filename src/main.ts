/**
 * Fase 0 — render de prueba sobre <canvas>.
 * Dibuja el estado de los drives y químicos en texto. NO es el render final:
 * los visuales de Bichito los porta Tecnotron (contrato en contracts/ivisuals.ts).
 */
import { BiochemEngine } from './biochem';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const context2d = canvas.getContext('2d');
if (!context2d) throw new Error('No se pudo obtener el contexto 2d del canvas');
const ctx: CanvasRenderingContext2D = context2d;

const engine = new BiochemEngine({
  initialChemicals: { glucosa: 0.8, dopamina: 0.4, serotonina: 0.3 },
  initialDrives: { energia: 0.7 },
});

const driveIds = engine.listDrives();
const chemicalIds = engine.listChemicals();

let frame = 0;
let simTime = 0;
let last = performance.now();

function draw(): void {
  const { width, height } = canvas;
  ctx.fillStyle = '#101418';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('Creatures — Fase 0 (render de prueba)', 24, 36);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#8b949e';
  ctx.fillText(`tick ${frame}  ·  t = ${simTime.toFixed(2)} s`, 24, 58);

  ctx.font = '14px monospace';
  let y = 92;
  ctx.fillStyle = '#7ee787';
  ctx.fillText('DRIVES', 24, y);
  y += 20;
  for (const id of driveIds) {
    const state = engine.getDrive(id);
    const w = Math.round(state.level * 240);
    const tw = Math.round(state.target * 240);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(`${id.padEnd(14)} ${state.level.toFixed(3)}`, 32, y);
    ctx.fillStyle = '#30363d';
    ctx.fillRect(280, y - 11, 240, 12);
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(280, y - 11, w, 12);
    ctx.fillStyle = '#f0b429'; // target (proyección 1 s)
    ctx.fillRect(280 + tw, y - 11, 2, 12);
    y += 20;
  }

  y += 14;
  ctx.fillStyle = '#d2a8ff';
  ctx.fillText('QUÍMICOS', 24, y);
  y += 20;
  for (const id of chemicalIds) {
    const level = engine.getChemical(id);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(`${id.padEnd(14)} ${level.toFixed(3)}`, 32, y);
    ctx.fillStyle = '#30363d';
    ctx.fillRect(280, y - 11, 240, 12);
    ctx.fillStyle = '#bc8cff';
    ctx.fillRect(280, y - 11, Math.round(level * 240), 12);
    y += 20;
  }
}

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  engine.tick(dt);
  simTime += dt;
  frame += 1;
  draw();
  requestAnimationFrame(loop);
}

draw();
requestAnimationFrame(loop);
