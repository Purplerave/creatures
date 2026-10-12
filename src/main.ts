/** Arranque: un snapshot del motor alimenta el puerto visual y la UI de drives. */
import type { RenderState } from './contracts/ivisuals';
import type { DriveId, TickResult } from './contracts/types';
import { BiochemEngine } from './biochem';
import { CanvasVisuals, deriveMood, MOOD_LABELS } from './visuals/canvasVisuals';
import { BrainV05Adapter } from './brain/adapter';
import { PlaceholderBrain } from './brain/placeholder-brain';
import type { BrainInputs, BrainOutput } from './contracts/ibrain';
import type { ChemicalId, DriveState } from './contracts/types';

const canvas = document.getElementById('app');
const moodBadge = document.getElementById('mood');
const driveGrid = document.getElementById('drive-grid');

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Falta el canvas #app');
if (!moodBadge) throw new Error('Falta el indicador de estado #mood');
if (!driveGrid) throw new Error('Falta el panel de drives #drive-grid');
const moodBadgeElement = moodBadge;

const engine = new BiochemEngine({
  initialChemicals: {
    glucosa: 0.8,
    adenosina: 0.12,
    dopamina: 0.4,
    cortisol: 0.06,
    oxitocina: 0.24,
    serotonina: 0.3,
  },
  initialDrives: {
    hambre: 0.22,
    energia: 0.76,
    sueno: 0.18,
    curiosidad: 0.62,
    vinculo: 0.54,
    aburrimiento: 0.2,
    miedo: 0.08,
    confort: 0.68,
  },
});

const DRIVE_LABELS: Record<string, string> = {
  hambre: 'Hambre',
  energia: 'Energía',
  sueno: 'Sueño',
  curiosidad: 'Curiosidad',
  vinculo: 'Vínculo',
  aburrimiento: 'Aburrimiento',
  miedo: 'Miedo',
  confort: 'Confort',
};

interface DriveReadout {
  meter: HTMLDivElement;
  value: HTMLOutputElement;
  fill: HTMLSpanElement;
}

const driveReadouts = new Map<DriveId, DriveReadout>();
for (const id of engine.listDrives()) {
  const card = document.createElement('article');
  card.className = 'drive-card';

  const line = document.createElement('div');
  line.className = 'drive-line';
  const label = document.createElement('span');
  label.textContent = DRIVE_LABELS[id] ?? id;
  const value = document.createElement('output');
  value.textContent = '0%';
  line.append(label, value);

  const meter = document.createElement('div');
  meter.className = 'drive-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', DRIVE_LABELS[id] ?? id);
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  const fill = document.createElement('span');
  meter.append(fill);

  card.append(line, meter);
  driveGrid.append(card);
  driveReadouts.set(id, { meter, value, fill });
}

const visuals = new CanvasVisuals();
visuals.mount(canvas);

// D1 — adaptador del cerebro v0.5 (interfaz IBrain). Placeholder temporal:
// se reemplaza por la clase real de `tecnotron/brain-v05` cuando suba su rama
// (solo cambia esta línea: el adaptador no conoce el MLP, ver docs/ADAPTER.md).
const brain = new BrainV05Adapter(new PlaceholderBrain());
let lastBrainOutput: BrainOutput = { actions: [0] };

const driveIds = engine.listDrives();
const chemicalIds = engine.listChemicals();

function brainInputs(tick: number): BrainInputs {
  const drives = {} as Record<DriveId, DriveState>;
  for (const id of driveIds) drives[id] = engine.getDrive(id);
  const chemicals = {} as Record<ChemicalId, number>;
  for (const id of chemicalIds) chemicals[id] = engine.getChemical(id);
  return { drives, chemicals, tick };
}

let frame = 0;
let simTime = 0;
let lastFrameTime = performance.now();
let animationFrame = 0;

function renderSnapshot(snapshot: TickResult): void {
  const state: RenderState = {
    frame,
    drives: snapshot.drives,
    chemicals: snapshot.chemicals,
    simTime,
  };
  const mood = deriveMood(state.drives);
  visuals.render(state);
  moodBadgeElement.dataset.mood = mood;
  moodBadgeElement.textContent = MOOD_LABELS[mood];
  const action = lastBrainOutput.actions[0] ?? 0;
  const confidence = lastBrainOutput.debug?.confidence ?? 0;
  moodBadgeElement.title = `cerebro v0.5 · acción ${action.toFixed(3)} · confianza ${confidence.toFixed(3)}`;

  for (const [id, readout] of driveReadouts) {
    const drive = state.drives[id];
    if (!drive) continue;
    const percentage = Math.round(Math.min(1, Math.max(0, drive.level)) * 100);
    readout.value.textContent = `${percentage}%`;
    readout.fill.style.width = `${percentage}%`;
    readout.meter.setAttribute('aria-valuenow', String(percentage));
  }
}

renderSnapshot(engine.tick(0));

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  simTime += dt;
  frame += 1;
  lastBrainOutput = brain.think(brainInputs(frame));
  renderSnapshot(engine.tick(dt));
  animationFrame = requestAnimationFrame(loop);
}

function cleanup(): void {
  cancelAnimationFrame(animationFrame);
  visuals.unmount();
}

animationFrame = requestAnimationFrame(loop);
window.addEventListener('pagehide', cleanup, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup();
    window.removeEventListener('pagehide', cleanup);
  });
}
