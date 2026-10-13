/**
 * Arranque: un snapshot alimenta la bioquímica, el cerebro, los visuales y la UI.
 *
 * Bucle de aprendizaje (Fases 3–4): el cerebro v0.5 elige una acción cada
 * 0,75 s simulados; el mundo por eventos la resuelve contra un objeto y aplica
 * un impulso bioquímico. La UI permite enseñar manualmente y el refuerzo
 * automático mide el cambio de malestar entre decisiones.
 */
import type { RenderState } from './contracts/ivisuals';
import type { BrainInputs, BrainOutput } from './contracts/ibrain';
import type { DriveId, TickResult } from './contracts/types';
import { BiochemEngine } from './biochem';
import type { BrainV05Adapter } from './brain/adapter';
import { createBrainRuntime } from './brain/runtime';
import { BrainV05 } from './brain/brain-v05';
import { actionFromValue, actionNameFromValue } from './brain/actions';
import { DEFAULT_REWARD_GAIN, driveDiscomfort, driveReductionReward } from './brain/reward';
import { Genome } from './genome';
import { Vocabulary } from './vocab';
import type { VocabEntry } from './contracts/ivocab';
import { CanvasVisuals, deriveMood, MOOD_LABELS } from './visuals/canvasVisuals';
import { CreatureWorld } from './world';

const canvas = document.getElementById('app');
const moodBadge = document.getElementById('mood');
const driveGrid = document.getElementById('drive-grid');
const teachForm = document.getElementById('teach-form');
const wordInput = document.getElementById('word-input');
const stimulusSelect = document.getElementById('stimulus-select');
const vocabularyList = document.getElementById('vocab-list');
const vocabularyStats = document.getElementById('vocab-stats');
const vocabularyFeedback = document.getElementById('vocab-feedback');
const brainStats = document.getElementById('brain-stats');
const brainDecision = document.getElementById('brain-decision');
const brainActionGrid = document.getElementById('brain-action-grid');
const brainEpsilonFill = document.getElementById('brain-epsilon-fill');
const brainEpsilonValue = document.getElementById('brain-epsilon-value');
const rewardButton = document.getElementById('reward-button');
const punishButton = document.getElementById('punish-button');
const autoRewardToggle = document.getElementById('auto-reward');
const brainFeedback = document.getElementById('brain-feedback');
const worldGrid = document.getElementById('world-grid');
const worldAction = document.getElementById('world-action');
const worldFeedback = document.getElementById('world-feedback');
const worldActionForm = document.getElementById('world-action-form');
const worldActionSelect = document.getElementById('world-action-select');

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Falta el canvas #app');
if (!moodBadge) throw new Error('Falta el indicador de estado #mood');
if (!driveGrid) throw new Error('Falta el panel de drives #drive-grid');
if (!(teachForm instanceof HTMLFormElement)) throw new Error('Falta el formulario #teach-form');
if (!(wordInput instanceof HTMLInputElement)) throw new Error('Falta el campo #word-input');
if (!(stimulusSelect instanceof HTMLSelectElement)) throw new Error('Falta el selector #stimulus-select');
if (!vocabularyList || !vocabularyStats || !vocabularyFeedback) {
  throw new Error('Falta el panel de vocabulario');
}
if (
  !brainStats ||
  !brainDecision ||
  !brainActionGrid ||
  !brainEpsilonFill ||
  !brainEpsilonValue ||
  !brainFeedback
) {
  throw new Error('Falta el panel del cerebro');
}
if (!(rewardButton instanceof HTMLButtonElement) || !(punishButton instanceof HTMLButtonElement)) {
  throw new Error('Faltan los botones de premio/castigo');
}
if (!(autoRewardToggle instanceof HTMLInputElement)) throw new Error('Falta el interruptor #auto-reward');
if (!worldGrid || !worldAction || !worldFeedback) throw new Error('Falta el panel del mundo');
if (!(worldActionForm instanceof HTMLFormElement)) throw new Error('Falta el formulario de prueba del mundo');
if (!(worldActionSelect instanceof HTMLSelectElement)) throw new Error('Falta el selector de acciones del mundo');
const moodBadgeElement = moodBadge;
const teachFormElement = teachForm;
const wordInputElement = wordInput;
const stimulusSelectElement = stimulusSelect;
const vocabularyListElement = vocabularyList;
const vocabularyStatsElement = vocabularyStats;
const vocabularyFeedbackElement = vocabularyFeedback;
const brainStatsElement = brainStats;
const brainDecisionElement = brainDecision;
const brainActionGridElement = brainActionGrid;
const brainEpsilonFillElement = brainEpsilonFill;
const brainEpsilonValueElement = brainEpsilonValue;
const brainFeedbackElement = brainFeedback;
const autoRewardElement = autoRewardToggle;
const worldGridElement = worldGrid;
const worldActionElement = worldAction;
const worldFeedbackElement = worldFeedback;
const worldActionFormElement = worldActionForm;
const worldActionSelectElement = worldActionSelect;
const rewardButtonElement = rewardButton;
const punishButtonElement = punishButton;

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

/** Semilla del cerebro: la misma partida se reproduce bit a bit. */
const BRAIN_SEED = 20261012;
/** Intensidad del premio/castigo manual (rango del contrato: [-1, 1]). */
const MANUAL_REWARD = 1;
/** El agente elige y mantiene una acción durante este intervalo simulado. */
const BRAIN_DECISION_INTERVAL = 0.75;

const genome = new Genome();
const phenotype = genome.getPhenotype();
// El cerebro real consume los knobs del genoma (hiddenSize, epsilonInitial,
// learningRate) que resuelve `createBrainRuntime()` desde el fenotipo.
const brainModel = new BrainV05({ ...phenotype.brain, seed: BRAIN_SEED });
const brainRuntime = createBrainRuntime(genome, () => brainModel);
const actionSpace = brainModel.getActions();
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
const world = new CreatureWorld();

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

/** Una fila por acción del codebook: se reutiliza entre frames (sin churn). */
interface ActionReadout {
  row: HTMLDivElement;
  fill: HTMLSpanElement;
  probability: HTMLOutputElement;
}

const actionReadouts = new Map<string, ActionReadout>();
for (const action of actionSpace) {
  const row = document.createElement('div');
  row.className = 'brain-action-row';
  row.dataset.actionId = action.id;

  const name = document.createElement('span');
  name.className = 'brain-action-name';
  name.textContent = action.name;

  const meter = document.createElement('div');
  meter.className = 'brain-action-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', `Probabilidad de ${action.name}`);
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  const fill = document.createElement('span');
  meter.append(fill);

  const probability = document.createElement('output');
  probability.className = 'brain-action-value';
  probability.textContent = '0%';

  row.append(name, meter, probability);
  brainActionGridElement.append(row);
  actionReadouts.set(action.id, { row, fill, probability });
}

interface WorldObjectReadout {
  card: HTMLElement;
  status: HTMLOutputElement;
  uses: HTMLOutputElement;
}

const worldObjectReadouts = new Map<string, WorldObjectReadout>();
for (const object of world.getSnapshot().objects) {
  const card = document.createElement('article');
  card.className = 'world-object';
  card.dataset.objectId = object.id;

  const heading = document.createElement('div');
  heading.className = 'world-object-heading';
  const icon = document.createElement('span');
  icon.className = 'world-object-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = object.icon;
  const name = document.createElement('h3');
  name.textContent = object.name;
  heading.append(icon, name);

  const description = document.createElement('p');
  description.className = 'world-object-description';
  description.textContent = object.description;

  const action = document.createElement('p');
  action.className = 'world-object-actions';
  action.textContent = object.actions.join(' · ');

  const state = document.createElement('div');
  state.className = 'world-object-state';
  const status = document.createElement('output');
  status.className = 'world-object-status';
  status.textContent = 'Listo';
  const uses = document.createElement('output');
  uses.className = 'world-object-uses';
  uses.textContent = '0 usos';
  state.append(status, uses);

  card.append(heading, description, action, state);
  worldGridElement.append(card);
  worldObjectReadouts.set(object.id, { card, status, uses });
}

const visuals = new CanvasVisuals();
visuals.mount(canvas);

let lastBrainOutput: BrainOutput = { actions: [0] };
let frame = 0;
let simTime = 0;
let lastFrameTime = performance.now();
let nextVocabularyRefresh = 0;
let nextWorldRefresh = 0;
let nextBrainDecision = 0;
let animationFrame = 0;
let previousDiscomfort = 0;
let suppressNextAutoReward = false;
let autoReward = autoRewardElement.checked;
let lastWorldSource: 'brain' | 'manual' = 'brain';

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
  const actionName = actionNameFromValue(actionSpace, action);
  const confidence = lastBrainOutput.debug?.confidence ?? 0;
  const explored = (lastBrainOutput.debug?.explored ?? 0) === 1;
  moodBadgeElement.title = `decisión del cerebro · ${actionName} · confianza ${confidence.toFixed(3)}${
    explored ? ' · exploración ε' : ''
  }`;

  for (const [id, readout] of driveReadouts) {
    const drive = state.drives[id];
    if (!drive) continue;
    const percentage = Math.round(Math.min(1, Math.max(0, drive.level)) * 100);
    readout.value.textContent = `${percentage}%`;
    readout.fill.style.width = `${percentage}%`;
    readout.meter.setAttribute('aria-valuenow', String(percentage));
  }
}

/** Panel del cerebro: decisión actual, ε y probabilidades del codebook. */
function renderBrain(): void {
  const debug = brainModel.getDebugState();
  const decision = debug.lastDecision;
  brainStatsElement.textContent = `${debug.thinks} decisiones · ${debug.reinforces} refuerzos`;
  brainDecisionElement.textContent = decision
    ? `${decision.name}${decision.explored ? ' (exploración ε)' : ''} · confianza ${(decision.confidence * 100).toFixed(0)}%`
    : 'Sin decisión todavía';

  const epsilonPercentage = Math.round(debug.epsilon * 100);
  brainEpsilonFillElement.style.width = `${epsilonPercentage}%`;
  brainEpsilonValueElement.textContent = `${epsilonPercentage}%`;
  brainEpsilonFillElement.parentElement?.setAttribute('aria-valuenow', String(epsilonPercentage));

  for (const action of debug.actions) {
    const readout = actionReadouts.get(action.id);
    if (!readout) continue;
    const probability = debug.probabilities[actionReadoutIndex(debug.actions, action.id)] ?? 0;
    const percentage = Math.round(probability * 100);
    readout.fill.style.width = `${percentage}%`;
    readout.probability.textContent = `${percentage}%`;
    const meter = readout.fill.parentElement;
    meter?.setAttribute('aria-valuenow', String(percentage));
    readout.row.dataset.chosen = decision?.id === action.id ? 'true' : 'false';
  }
}

function renderWorld(): void {
  const snapshot = world.getSnapshot();
  for (const object of snapshot.objects) {
    const readout = worldObjectReadouts.get(object.id);
    if (!readout) continue;
    readout.card.dataset.ready = String(object.ready);
    readout.status.textContent = object.ready
      ? 'Listo'
      : `Recuperándose · ${object.cooldownRemaining < 1 ? '<1' : object.cooldownRemaining.toFixed(1)} s`;
    readout.uses.textContent = `${object.uses} ${object.uses === 1 ? 'uso' : 'usos'}`;
  }

  const lastActionId = snapshot.lastInteraction?.actionId;
  const lastAction = actionSpace.find((action) => action.id === lastActionId);
  worldActionElement.textContent = `${lastWorldSource === 'manual' ? 'Prueba manual' : 'Cerebro'} · ${
    lastAction?.name ?? 'sin acción'
  }`;
}

function actionReadoutIndex(actions: readonly { id: string }[], id: string): number {
  return actions.findIndex((action) => action.id === id);
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
    empty.textContent = 'Todavía no se han enseñado asociaciones.';
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
    vocabularyFeedbackElement.textContent = `Asociación registrada: «${word}» → ${stimulusLabel}. Repítela para reforzarla.`;
    wordInputElement.value = '';
    renderVocabulary();
    wordInputElement.focus();
  } catch (error) {
    vocabularyFeedbackElement.textContent = error instanceof Error ? error.message : 'No se pudo enseñar la palabra.';
    wordInputElement.focus();
  }
}

/** Premio/castigo manual sobre la ÚLTIMA decisión (a través del adaptador). */
function performWorldAction(actionId: string, source: 'brain' | 'manual'): void {
  const interaction = world.performAction(actionId);
  lastWorldSource = source;
  if (interaction.applied && interaction.impulse) engine.applyImpulse(interaction.impulse);

  // Una intervención de prueba cambia el estado del mundo, pero no debe
  // atribuirse a la acción anterior que tomó el cerebro.
  if (source === 'manual' && interaction.applied) {
    suppressNextAutoReward = true;
    previousDiscomfort = driveDiscomfort(engine.tick(0).drives);
  }

  const prefix = source === 'manual' ? 'Prueba manual' : 'Acción del cerebro';
  const note = source === 'manual' && interaction.applied
    ? ' No se enseña al cerebro con esta prueba.'
    : '';
  worldFeedbackElement.textContent = `${prefix}: ${interaction.message}${note}`;
  renderWorld();
}

function onWorldActionSubmit(event: SubmitEvent): void {
  event.preventDefault();
  try {
    performWorldAction(worldActionSelectElement.value, 'manual');
  } catch (error) {
    worldFeedbackElement.textContent = error instanceof Error ? error.message : 'No se pudo ejecutar la acción.';
  }
}

function manualReinforce(reward: number): void {
  const before = brainModel.getDebugState();
  brain.reinforce(reward);
  const after = brainModel.getDebugState();
  const decision = after.lastDecision;
  const applied = after.reinforces > before.reinforces;
  brainFeedbackElement.textContent = applied
    ? `${reward > 0 ? 'Premio' : 'Castigo'} de ${reward > 0 ? '+' : '−'}${Math.abs(reward).toFixed(0)} sobre «${
        decision?.name ?? '—'
      }». Sus sinapsis se ${reward > 0 ? 'refuerzan' : 'debilitan'}.`
    : 'Todavía no hay ninguna decisión que reforzar.';
  renderBrain();
}

function onRewardClick(): void {
  manualReinforce(MANUAL_REWARD);
}

function onPunishClick(): void {
  manualReinforce(-MANUAL_REWARD);
}

function onAutoRewardChange(): void {
  autoReward = autoRewardElement.checked;
  brainFeedbackElement.textContent = autoReward
    ? `Refuerzo automático activo: la recompensa es la reducción de malestar (ganancia ${DEFAULT_REWARD_GAIN}).`
    : 'Refuerzo automático desactivado: solo cuentan los premios y castigos manuales.';
}

teachFormElement.addEventListener('submit', teachWord);
worldActionFormElement.addEventListener('submit', onWorldActionSubmit);
rewardButtonElement.addEventListener('click', onRewardClick);
punishButtonElement.addEventListener('click', onPunishClick);
autoRewardElement.addEventListener('change', onAutoRewardChange);
renderVocabulary();

const initialSnapshot = engine.tick(0);
previousDiscomfort = driveDiscomfort(initialSnapshot.drives);
lastBrainOutput = brain.think(brainInputs(initialSnapshot, frame));
const initialAction = actionFromValue(actionSpace, lastBrainOutput.actions[0] ?? 0);
if (initialAction) performWorldAction(initialAction.action.id, 'brain');
renderSnapshot(initialSnapshot);
renderBrain();
renderWorld();
nextBrainDecision = BRAIN_DECISION_INTERVAL;

function loop(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  simTime += dt;
  frame += 1;

  world.advance(dt);
  const snapshot = engine.tick(dt);
  vocabulary.tick(dt);
  const discomfort = driveDiscomfort(snapshot.drives);

  // La decisión se sostiene 0,75 s simulados. Así cada refuerzo evalúa el
  // resultado de la acción anterior, no un cambio casi nulo de un fotograma.
  // Si el refuerzo está apagado, se mueve el baseline continuamente para que
  // reactivarlo no premie/castigue el tiempo transcurrido con el cerebro parado.
  if (!autoReward) previousDiscomfort = discomfort;
  if (simTime >= nextBrainDecision) {
    const skipReward = suppressNextAutoReward;
    suppressNextAutoReward = false;
    if (autoReward && !skipReward) {
      brain.reinforce(driveReductionReward(previousDiscomfort, discomfort));
    }
    previousDiscomfort = discomfort;

    lastBrainOutput = brain.think(brainInputs(snapshot, frame));
    const selected = actionFromValue(actionSpace, lastBrainOutput.actions[0] ?? 0);
    if (selected) performWorldAction(selected.action.id, 'brain');
    renderBrain();
    nextBrainDecision = simTime + BRAIN_DECISION_INTERVAL;
  }

  renderSnapshot(snapshot);
  if (simTime >= nextWorldRefresh) {
    renderWorld();
    nextWorldRefresh = simTime + 0.25;
  }
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
  worldActionFormElement.removeEventListener('submit', onWorldActionSubmit);
  rewardButtonElement.removeEventListener('click', onRewardClick);
  punishButtonElement.removeEventListener('click', onPunishClick);
  autoRewardElement.removeEventListener('change', onAutoRewardChange);
  brainModel.dispose();
}

animationFrame = requestAnimationFrame(loop);
window.addEventListener('pagehide', cleanup, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup();
    window.removeEventListener('pagehide', cleanup);
  });
}
