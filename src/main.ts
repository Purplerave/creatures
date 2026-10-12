/** Arranque: un snapshot alimenta la bioquímica, el cerebro, los visuales y la UI. */
import type { RenderState } from './contracts/ivisuals';
import type { BrainInputs, BrainOutput } from './contracts/ibrain';
import type { DriveId, TickResult } from './contracts/types';
import { BiochemEngine } from './biochem';
import type { BrainV05Adapter } from './brain/adapter';
import { createBrainRuntime } from './brain/runtime';
import { PlaceholderBrain } from './brain/placeholder-brain';
import { Genome } from './genome';
import { Vocabulary } from './vocab';
import type { VocabEntry } from './contracts/ivocab';
import { CanvasVisuals, deriveMood, MOOD_LABELS } from './visuals/canvasVisuals';

const canvas = document.getElementById('app');
const moodBadge = document.getElementById('mood');
const driveGrid = document.getElementById('drive-grid');
const teachForm = document.getElementById('teach-form');
const wordInput = document.getElementById('word-input');
const stimulusSelect = document.getElementById('stimulus-select');
const vocabularyList = document.getElementById('vocab-list');
const vocabularyStats = document.getElementById('vocab-stats');
const vocabularyFeedback = document.getElementById('vocab-feedback');

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Falta el canvas #app');
if (!moodBadge) throw new Error('Falta el indicador de estado #mood');
if (!driveGrid) throw new Error('Falta el panel de drives #drive-grid');
if (!(teachForm instanceof HTMLFormElement)) throw new Error('Falta el formulario #teach-form');
if (!(wordInput instanceof HTMLInputElement)) throw new Error('Falta el campo #word-input');
if (!(stimulusSelect instanceof HTMLSelectElement)) throw new Error('Falta el selector #stimulus-select');
if (!vocabularyList || !vocabularyStats || !vocabularyFeedback) {
  throw new Error('Falta el panel de vocabulario');
}
const moodBadgeElement = moodBadge;
const teachFormElement = teachForm;
const wordInputElement = wordInput;
const stimulusSelectElement = stimulusSelect;
const vocabularyListElement = vocabularyList;
const vocabularyStatsElement = vocabularyStats;
const vocabularyFeedbackElement = vocabularyFeedback;

const STIMULI = [
  { id: 'comida', label: 'Comida' },
  { id: 'objeto:pelota', label: 'Pelota' },
  { id: 'luz:suave', label: 'Luz suave' },
] as const;

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

const genome = new Genome();
const brainRuntime = createBrainRuntime(genome, (_knobs) => new PlaceholderBrain());
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
  phenotype: brainRuntime.phenotype,
});
const brain: BrainV05Adapter = brainRuntime.brain;
const vocabulary = new Vocabulary();

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

let lastBrainOutput: BrainOutput = { actions: [0] };
let frame = 0;
let simTime = 0;
let lastFrameTime = performance.now();
let nextVocabularyRefresh = 0;
let animationFrame = 0;

function brainInputs(snapshot: TickResult, tick: number): BrainInputs {
  return { drives: snapshot.drives, chemicals: snapshot.chemicals, tick };
}

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
  moodBadgeElement.title = `salida del cerebro · acción ${action.toFixed(3)} · confianza ${confidence.toFixed(3)}`;

  for (const [id, readout] of driveReadouts) {
    const drive = state.drives[id];
    if (!drive) continue;
    const percentage = Math.round(Math.min(1, Math.max(0, drive.level)) * 100);
    readout.value.textContent = `${percentage}%`;
    readout.fill.style.width = `${percentage}%`;
    readout.meter.setAttribute('aria-valuenow', String(percentage));
  }
}

function renderVocabulary(): void {
  const entries: Array<{ entry: VocabEntry; stimulusLabel: string }> = [];
  for (const stimulus of STIMULI) {
    for (const entry of vocabulary.recall(stimulus.id)) {
      entries.push({ entry, stimulusLabel: stimulus.label });
    }
  }

  vocabularyListElement.replaceChildren();
  const stats = vocabulary.getStats();
  vocabularyStatsElement.textContent = `${stats.words} palabras · ${stats.learned}/${stats.total} asociaciones aprendidas`;

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'vocab-empty';
    empty.textContent = 'Todavía no ha asociado ninguna palabra.';
    vocabularyListElement.append(empty);
    return;
  }

  for (const { entry, stimulusLabel } of entries) {
    const card = document.createElement('article');
    card.className = 'vocab-entry';

    const heading = document.createElement('div');
    heading.className = 'vocab-entry-heading';
    const word = document.createElement('strong');
    word.className = 'vocab-word';
    word.textContent = entry.word;
    const status = document.createElement('span');
    status.className = entry.learned ? 'vocab-status learned' : 'vocab-status';
    status.textContent = entry.learned ? 'Aprendida' : 'Aprendiendo';
    heading.append(word, status);

    const association = document.createElement('p');
    association.className = 'vocab-association';
    association.textContent = `Asociada con ${stimulusLabel} · ${entry.reps} ${entry.reps === 1 ? 'repetición' : 'repeticiones'}`;

    const meter = document.createElement('div');
    meter.className = 'vocab-meter';
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', `Confianza de ${entry.word}`);
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    const percentage = Math.round(entry.confidence * 100);
    meter.setAttribute('aria-valuenow', String(percentage));
    const fill = document.createElement('span');
    fill.style.width = `${percentage}%`;
    meter.append(fill);

    card.append(heading, association, meter);
    vocabularyListElement.append(card);
  }
}

function teachWord(event: SubmitEvent): void {
  event.preventDefault();
  const word = wordInputElement.value.trim();
  try {
    vocabulary.teach(word, stimulusSelectElement.value);
    const stimulusLabel = STIMULI.find((stimulus) => stimulus.id === stimulusSelectElement.value)?.label ?? 'el objeto';
    vocabularyFeedbackElement.textContent = `Nilo asoció «${word}» con ${stimulusLabel}. Repite la asociación para reforzarla.`;
    wordInputElement.value = '';
    renderVocabulary();
    wordInputElement.focus();
  } catch (error) {
    vocabularyFeedbackElement.textContent = error instanceof Error ? error.message : 'No se pudo enseñar la palabra.';
    wordInputElement.focus();
  }
}

teachFormElement.addEventListener('submit', teachWord);
renderVocabulary();

const initialSnapshot = engine.tick(0);
lastBrainOutput = brain.think(brainInputs(initialSnapshot, frame));
renderSnapshot(initialSnapshot);

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  simTime += dt;
  frame += 1;

  const snapshot = engine.tick(dt);
  vocabulary.tick(dt);
  lastBrainOutput = brain.think(brainInputs(snapshot, frame));
  renderSnapshot(snapshot);

  if (simTime >= nextVocabularyRefresh) {
    renderVocabulary();
    nextVocabularyRefresh = simTime + 0.25;
  }
  animationFrame = requestAnimationFrame(loop);
}

function cleanup(): void {
  cancelAnimationFrame(animationFrame);
  visuals.unmount();
  teachFormElement.removeEventListener('submit', teachWord);
}

animationFrame = requestAnimationFrame(loop);
window.addEventListener('pagehide', cleanup, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup();
    window.removeEventListener('pagehide', cleanup);
  });
}
