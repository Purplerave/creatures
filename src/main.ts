/**
 * Composición completa del organismo digital Creatures:
 *  - Fase 0: `BiochemEngine` determinista (8 drives, 6 químicos, reacciones A→B).
 *  - L1: `CanvasVisuals` (`Path2D` + hábitat espacial con profundidad y caminata).
 *  - D1/D2 + L2: `BrainV05Adapter` + `BrainView` en `<canvas id="brain-canvas">`.
 *  - Fase 3: `BrainV05` (MLP 15 → hiddenSize → 5, ε-greedy + Hebbiano modulado).
 *  - Fase 4: `CreatureWorld` (objetos 2D, desplazamiento, alcance y eventos).
 *  - F2 «Genoma Creatures»: cabeceras ricas, `switchOnTime`, metilación y cría.
 *  - Fase 5: `SaveCoordinator` transaccional (navegador + JSON export/import).
 */
import type { RenderState } from './contracts/ivisuals';
import type { BrainInputs, BrainOutput } from './contracts/ibrain';
import type { ChemicalId, DriveId, TickResult } from './contracts/types';
import { BiochemEngine } from './biochem';
import {
  DRIVE_ORDER,
  STIMULUS_CHEMICALS,
  createBrainRuntime,
  type BrainV05Adapter,
} from './brain';
import { BrainV05 } from './brain/brain-v05';
import { actionFromValue, actionNameFromValue } from './brain/actions';
import { DEFAULT_REWARD_GAIN, driveDiscomfort, driveReductionReward } from './brain/reward';
import {
  Genome,
  encodeAllelesToOrf,
  listGeneDefs,
  resolveGeneHeader,
  translateDna,
} from './genome';
import { Vocabulary } from './vocab';
import type { VocabEntry } from './contracts/ivocab';
import { CanvasVisuals, deriveMood, MOOD_LABELS } from './visuals/canvasVisuals';
import { CreatureWorld, WORLD_ACTION_LABELS, type WorldObjectId } from './world';
import { BrainView } from './render';
import {
  clearGameFromStorage,
  hatchOffspring,
  loadGameFromStorage,
  resolveBrowserStorage,
  resolveLifeStage,
  restoreGameState,
  saveGameToStorage,
  serializeGameState,
} from './persistence';

const canvas = document.getElementById('app');
const brainCanvas = document.getElementById('brain-canvas');
const creatureNameHeading = document.getElementById('creature-name');
const creatureSubtitle = document.getElementById('creature-subtitle');
const moodBadge = document.getElementById('mood');
const needStatus = document.getElementById('need-status');
const driveGrid = document.getElementById('drive-grid');
const chemStrip = document.getElementById('chem-strip');
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
const habitatChallenges = document.getElementById('habitat-challenges');
const worldAction = document.getElementById('world-action');
const worldCoords = document.getElementById('world-coords');
const worldFeedback = document.getElementById('world-feedback');
const activityLog = document.getElementById('activity-log');
const worldActionForm = document.getElementById('world-action-form');
const worldActionSelect = document.getElementById('world-action-select');
const spatialStrictToggle = document.getElementById('spatial-strict');
const genomeGrid = document.getElementById('genome-grid');
const genomeDna = document.getElementById('genome-dna');
const genomeStats = document.getElementById('genome-stats');
const genomeFeedback = document.getElementById('genome-feedback');
const mutateGenomeButton = document.getElementById('mutate-genome-button');
const hatchOffspringButton = document.getElementById('hatch-offspring-button');
const persistenceStatus = document.getElementById('persistence-status');
const persistenceFeedback = document.getElementById('persistence-feedback');
const saveGameButton = document.getElementById('save-game-button');
const loadGameButton = document.getElementById('load-game-button');
const exportJsonButton = document.getElementById('export-json-button');
const importJsonInput = document.getElementById('import-json-input');
const resetGameButton = document.getElementById('reset-game-button');
const speedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.speed-btn'));
const autonomyToggle = document.getElementById('autonomy-toggle');

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
if (!(autonomyToggle instanceof HTMLInputElement)) throw new Error('Falta el interruptor #autonomy-toggle');

const habitatCanvas = canvas;
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
const autonomyToggleElement = autonomyToggle;
const rewardButtonElement = rewardButton;
const punishButtonElement = punishButton;

const STIMULI = [
  { id: 'comida', label: 'Comida' },
  { id: 'objeto:pelota', label: 'Pelota' },
  { id: 'luz:suave', label: 'Luz suave' },
] as const;

const OBJECT_STIMULUS_MAP: Partial<Record<WorldObjectId, string>> = {
  comedero: 'comida',
  pelota: 'objeto:pelota',
  'luz-suave': 'luz:suave',
};

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

const CHEMICAL_LABELS: Record<string, string> = {
  glucosa: 'Glucosa',
  adenosina: 'Adenosina',
  dopamina: 'Dopamina',
  cortisol: 'Cortisol',
  oxitocina: 'Oxitocina',
  serotonina: 'Serotonina',
};

const INITIAL_CHEMICALS: Record<string, number> = {
  glucosa: 0.8,
  adenosina: 0.12,
  dopamina: 0.4,
  cortisol: 0.06,
  oxitocina: 0.24,
  serotonina: 0.3,
};

const INITIAL_DRIVES: Record<string, number> = {
  hambre: 0.22,
  energia: 0.76,
  sueno: 0.18,
  curiosidad: 0.62,
  vinculo: 0.54,
  aburrimiento: 0.2,
  miedo: 0.08,
  confort: 0.68,
};

/** Semilla del cerebro: la misma partida se reproduce bit a bit. */
const BRAIN_SEED = 20261012;
/** Intensidad del premio/castigo manual (rango del contrato: [-1, 1]). */
const MANUAL_REWARD = 1;
/** El agente elige y mantiene una acción durante este intervalo simulado. */
const BRAIN_DECISION_INTERVAL = 0.75;

const browserStorage = resolveBrowserStorage();

let creatureName = 'Nilo';
let genome = new Genome();
let phenotype = genome.getPhenotype({ ageSeconds: 0 });
let brainModel = new BrainV05({ ...phenotype.brain, seed: BRAIN_SEED });
let brainRuntime = createBrainRuntime(genome, () => brainModel);
let actionSpace = brainModel.getActions();
let engine = new BiochemEngine({
  initialChemicals: INITIAL_CHEMICALS,
  initialDrives: INITIAL_DRIVES,
  phenotype: brainRuntime.phenotype,
});
let brain: BrainV05Adapter = brainRuntime.brain;
let vocabulary = new Vocabulary();
let world = new CreatureWorld();

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

const chemReadouts = new Map<ChemicalId, HTMLOutputElement>();
if (chemStrip) {
  for (const id of engine.listChemicals()) {
    const pill = document.createElement('div');
    pill.className = 'chem-pill';
    const label = document.createElement('span');
    label.textContent = CHEMICAL_LABELS[id] ?? id;
    const value = document.createElement('output');
    value.textContent = '0%';
    pill.append(label, value);
    chemStrip.append(pill);
    chemReadouts.set(id, value);
  }
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
  zone: HTMLSpanElement;
  range: HTMLOutputElement;
  status: HTMLOutputElement;
  uses: HTMLOutputElement;
}

const habitatChallengeDefs = [
  { objectId: 'peluche', label: 'Abraza al peluche' },
  { objectId: 'tunel', label: 'Atraviesa el túnel' },
  { objectId: 'ventana', label: 'Mira el jardín' },
  { objectId: 'xilofono', label: 'Toca el xilófono' },
] as const;

if (habitatChallenges) {
  const heading = document.createElement('div');
  heading.className = 'habitat-challenges-heading';
  const title = document.createElement('strong');
  title.textContent = 'Pequeños retos';
  const progress = document.createElement('output');
  progress.setAttribute('aria-label', 'Retos completados');
  heading.append(title, progress);
  const list = document.createElement('ul');
  list.className = 'habitat-challenges-list';
  for (const challenge of habitatChallengeDefs) {
    const item = document.createElement('li');
    item.className = 'habitat-challenge';
    item.dataset.challengeId = challenge.objectId;
    item.textContent = challenge.label;
    list.append(item);
  }
  habitatChallenges.append(heading, list);
}

const worldObjectReadouts = new Map<string, WorldObjectReadout>();
for (const object of world.getSnapshot().objects) {
  const card = document.createElement('article');
  card.className = 'world-object';
  card.dataset.objectId = object.id;
  card.setAttribute('aria-label', `${object.name}: ${object.description}`);

  const heading = document.createElement('div');
  heading.className = 'world-object-heading';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'world-object-title';
  const icon = document.createElement('span');
  icon.className = 'world-object-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = object.icon;
  const name = document.createElement('h3');
  name.textContent = object.name;
  titleWrap.append(icon, name);

  const zone = document.createElement('span');
  zone.className = 'world-object-zone';
  zone.textContent = object.zoneLabel;
  heading.append(titleWrap, zone);

  const range = document.createElement('output');
  range.className = 'world-object-range';
  range.textContent = object.inRange ? 'Cerca' : `A ${Math.round(object.distance * 100)} %`;

  const description = document.createElement('p');
  description.className = 'world-object-description';
  description.textContent = object.description;

  const action = document.createElement('div');
  action.className = 'world-object-actions';
  for (const verb of object.actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'world-object-action-button';
    button.textContent = actionSpace.find((item) => item.id === verb)?.name ?? WORLD_ACTION_LABELS[verb];
    button.addEventListener('click', () => performWorldAction(verb, 'manual'));
    action.append(button);
  }

  const state = document.createElement('div');
  state.className = 'world-object-state';
  const status = document.createElement('output');
  status.className = 'world-object-status';
  status.textContent = 'Listo';
  const uses = document.createElement('output');
  uses.className = 'world-object-uses';
  uses.textContent = '0 usos';
  state.append(status, uses);

  card.append(heading, range, description, action, state);
  
  worldGridElement.append(card);
  worldObjectReadouts.set(object.id, { card, zone, range, status, uses });
}

const visuals = new CanvasVisuals();
visuals.mount(habitatCanvas);

let brainView: BrainView | null = null;
if (brainCanvas instanceof HTMLCanvasElement) {
  brainView = new BrainView({ getDebugState: () => brain.getDebugState() });
  brainView.mount(brainCanvas);
}

let lastBrainOutput: BrainOutput = { actions: [0] };
let frame = 0;
let simTime = 0;
let timeScale = 1;
let mutationCounter = 1;
let lastFrameTime = performance.now();
let simulationAccumulator = 0;
const SIMULATION_STEP_SECONDS = 1 / 60;
const MAX_SIMULATION_BACKLOG_SECONDS = 0.25;
let nextVocabularyRefresh = 0;
let nextWorldRefresh = 0;
let nextBrainDecision = 0;
let animationFrame = 0;
let previousDiscomfort = 0;
let suppressNextAutoReward = false;
let autoReward = autoRewardElement.checked;
let spatialStrict = spatialStrictToggle instanceof HTMLInputElement ? spatialStrictToggle.checked : true;
let autonomousMode = autonomyToggleElement.checked;
let lastWorldSource: 'brain' | 'manual' = 'manual';
let activeSpeech = '';
let speechExpiresAt = 0;

function setSpeech(message: string, durationSimSeconds = 2.4): void {
  activeSpeech = message;
  speechExpiresAt = simTime + durationSimSeconds;
}

function recordActivity(label: string, detail: string): void {
  if (!activityLog) return;
  if (activityLog.querySelector('.activity-empty')) activityLog.replaceChildren();

  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = `${simTime.toFixed(1)} s`;
  const heading = document.createElement('strong');
  heading.textContent = label;
  const message = document.createElement('span');
  message.textContent = detail;
  item.append(time, heading, message);
  activityLog.prepend(item);

  while (activityLog.children.length > 8) {
    activityLog.lastElementChild?.remove();
  }
}

function recallSpokenWordForObject(objectId: WorldObjectId): string | null {
  const stimulusId = OBJECT_STIMULUS_MAP[objectId];
  if (!stimulusId) return null;
  const entries = vocabulary.recall(stimulusId);
  const best = entries.find((item) => item.learned) ?? entries[0];
  if (!best) return null;
  return best.learned ? `¡«${best.word}»!` : `¿«${best.word}»…?`;
}

function brainInputs(snapshot: TickResult, tick: number): BrainInputs {
  return { drives: snapshot.drives, chemicals: snapshot.chemicals, tick };
}

function renderGenomePanel(): void {
  if (!genomeGrid || !genomeStats) return;
  const loci = genome.getLoci();
  const duplicateCount = loci.filter((locus) => locus.copyIndex > 0).length;
  const methylatedCount = listGeneDefs().filter((def) => genome.isMethylated(def.id)).length;
  const currentPhenotype = genome.getPhenotype({ ageSeconds: simTime });
  genomeStats.textContent = `GEN. ${String(genome.getGeneration()).padStart(2, '0')} · ${loci.length} loci${
    duplicateCount > 0 ? ` (+${duplicateCount} dup)` : ''
  } · ${currentPhenotype.brain.hiddenSize ?? 12} ocultas${
    methylatedCount > 0 ? ` · ${methylatedCount} metilados` : ''
  }`;

  genomeGrid.replaceChildren();
  for (const def of listGeneDefs()) {
    const header = resolveGeneHeader(def);
    const methylated = genome.isMethylated(def.id);
    const val = genome.getGene(def.id);
    const copies = loci.filter((locus) => locus.geneId === def.id).length;

    const card = document.createElement('article');
    card.className = 'gene-card';
    card.dataset.geneId = def.id;
    card.dataset.methylated = String(methylated);

    const top = document.createElement('div');
    top.className = 'gene-card-top';
    const name = document.createElement('span');
    name.textContent = copies > 1 ? `${def.label} ×${copies}` : def.label;
    const pct = document.createElement('output');
    pct.textContent = `${Math.round(val * 100)}%`;
    top.append(name, pct);

    const meta = document.createElement('div');
    meta.className = 'gene-card-meta';
    const fam = document.createElement('span');
    fam.textContent = header.family.toUpperCase();
    const badge = document.createElement('span');
    if (header.critical) {
      badge.className = 'gene-tag-critical';
      badge.textContent = 'CRÍTICO';
    } else {
      badge.textContent = `MUT ${header.mutability}`;
    }
    meta.append(fam, badge);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gene-methyl-btn';
    btn.setAttribute('aria-pressed', String(methylated));
    btn.textContent = methylated ? 'Metilado (silenciado)' : 'Expresado · Metilar';
    btn.addEventListener('click', () => {
      genome.setMethylation(def.id, !methylated);
      engine.setPhenotype(genome.getPhenotype({ ageSeconds: simTime }));
      if (genomeFeedback) {
        genomeFeedback.textContent = !methylated
          ? `Marca epigenética activada en «${def.label}»: gen silenciado reversiblemente sin mutar secuencia.`
          : `Marca epigenética retirada en «${def.label}»: expresión restaurada.`;
      }
      renderGenomePanel();
    });

    card.append(top, meta, btn);
    genomeGrid.append(card);
  }

  if (genomeDna) {
    const cfg = genome.toConfig();
    const orf = encodeAllelesToOrf(cfg.genes, cfg.seed, 11);
    const peptide = translateDna(orf);
    genomeDna.textContent = `5′ ${orf} 3′ · Péptido (${peptide.length} aa): ${peptide}`;
  }
}

function renderSnapshot(snapshot: TickResult): void {
  const worldSnap = world.getSnapshot();
  const stage = resolveLifeStage(simTime);
  if (creatureNameHeading) creatureNameHeading.textContent = creatureName;
  if (creatureSubtitle) {
    creatureSubtitle.textContent = `Generación ${genome.getGeneration()} · día ${stage.day} · ${stage.label}`;
  }

  const speechText = simTime < speechExpiresAt ? activeSpeech : undefined;
  const state: RenderState = {
    frame,
    drives: snapshot.drives,
    chemicals: snapshot.chemicals,
    simTime,
    world: {
      creaturePosition: worldSnap.creature.position,
      creatureVelocity: worldSnap.creature.velocity,
      heading: worldSnap.creature.heading,
      targetObjectId: worldSnap.creature.targetObjectId,
      targetPosition: worldSnap.creature.targetPosition,
      activeObjectId: worldSnap.lastInteraction?.applied ? worldSnap.lastInteraction.objectId : null,
      objects: worldSnap.objects.map((item) => ({
        id: item.id,
        name: item.name,
        zoneLabel: item.zoneLabel,
        icon: item.icon,
        position: item.position,
        cooldownRemaining: item.cooldownRemaining,
        cooldownSeconds: item.cooldownSeconds,
        uses: item.uses,
        ready: item.ready,
        inRange: item.inRange,
      })),
      speech: speechText,
    },
  };
  const actionableNeeds = [
    { id: 'hambre' as DriveId, urgency: state.drives.hambre?.level ?? 0, label: 'buscar comida' },
    { id: 'sueno' as DriveId, urgency: state.drives.sueno?.level ?? 0, label: 'descansar' },
    { id: 'aburrimiento' as DriveId, urgency: state.drives.aburrimiento?.level ?? 0, label: 'jugar o explorar' },
    { id: 'miedo' as DriveId, urgency: state.drives.miedo?.level ?? 0, label: 'sentirse a salvo' },
    { id: 'energia' as DriveId, urgency: 1 - (state.drives.energia?.level ?? 1), label: 'recuperar energía' },
    { id: 'confort' as DriveId, urgency: 1 - (state.drives.confort?.level ?? 1), label: 'estar cómodo' },
  ];
  const primaryNeed = actionableNeeds.reduce((best, need) => need.urgency > best.urgency ? need : best);
  if (needStatus) {
    needStatus.textContent =
      primaryNeed.urgency < 0.18 ? 'Necesidades tranquilas' : `Ahora: ${primaryNeed.label}`;
    needStatus.setAttribute('aria-label', `Necesidad principal: ${primaryNeed.label}`);
    needStatus.setAttribute('title', `Urgencia aproximada: ${Math.round(primaryNeed.urgency * 100)} %`);
  }

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

  for (const [id, output] of chemReadouts) {
    const level = state.chemicals[id] ?? 0;
    output.textContent = `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%`;
  }

  if (brainView) {
    const modelDebug = brainModel.getDebugState();
    brainView.render({
      drives: DRIVE_ORDER.map((id) => state.drives[id]?.level ?? 0),
      stimuli: STIMULUS_CHEMICALS.map((id) => state.chemicals[id] ?? 0),
      actions: actionSpace,
      probabilities: modelDebug.probabilities,
      epsilon: modelDebug.epsilon,
    });
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
  const completedChallenges = habitatChallengeDefs.filter((challenge) => (snapshot.objects.find((object) => object.id === challenge.objectId)?.uses ?? 0) > 0).length;
  const challengeProgress = habitatChallenges?.querySelector('output');
  if (challengeProgress) challengeProgress.textContent = `${completedChallenges}/${habitatChallengeDefs.length} completados`;
  for (const challenge of habitatChallengeDefs) {
    const item = habitatChallenges?.querySelector<HTMLElement>(`[data-challenge-id="${challenge.objectId}"]`);
    if (item) item.dataset.complete = String((snapshot.objects.find((object) => object.id === challenge.objectId)?.uses ?? 0) > 0);
  }
  for (const object of snapshot.objects) {
    const readout = worldObjectReadouts.get(object.id);
    if (!readout) continue;
    readout.card.dataset.ready = String(object.ready);
    readout.card.dataset.inRange = String(object.inRange);
    readout.range.textContent = object.inRange ? 'Nilo está aquí' : `A ${Math.round(object.distance * 100)} %`;
    readout.status.textContent = object.ready
      ? 'Listo'
      : `Recuperándose · ${object.cooldownRemaining < 1 ? '<1' : object.cooldownRemaining.toFixed(1)} s`;
    readout.uses.textContent = `${object.uses} ${object.uses === 1 ? 'uso' : 'usos'}`;
  }

  if (worldCoords) {
    worldCoords.textContent = `Pos (${snapshot.creature.position.x.toFixed(2)}, ${snapshot.creature.position.y.toFixed(2)})`;
  }

  const lastActionId = snapshot.lastInteraction?.actionId;
  const lastAction = actionSpace.find((action) => action.id === lastActionId);
  const actor = lastWorldSource === 'manual' ? 'Tú elegiste' : 'Nilo eligió';
  worldActionElement.textContent = lastActionId
    ? `${actor} · ${lastAction?.name ?? WORLD_ACTION_LABELS[lastActionId]}`
    : 'Elige una actividad';
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
    setSpeech(`«${word}» → ${stimulusLabel}`);
    wordInputElement.value = '';
    renderVocabulary();
    wordInputElement.focus();
  } catch (error) {
    vocabularyFeedbackElement.textContent = error instanceof Error ? error.message : 'No se pudo enseñar la palabra.';
    wordInputElement.focus();
  }
}

/** Ejecuta una acción contra el mundo (manual o cerebral). */
function performWorldAction(actionId: string, source: 'brain' | 'manual'): void {
  const requireProximity = spatialStrict;
  const interaction = world.performAction(actionId, { requireProximity });
  lastWorldSource = source;
  if (interaction.applied && interaction.impulse) {
    engine.applyImpulse(interaction.impulse);
    const spoken = recallSpokenWordForObject(interaction.objectId);
    setSpeech(spoken ?? (interaction.objectId === 'comedero' ? '¡Ñam!' : WORLD_ACTION_LABELS[interaction.actionId]));
  }

  // Una intervención de prueba cambia el estado del mundo, pero no debe
  // atribuirse a la acción anterior que tomó el cerebro.
  if (source === 'manual' && interaction.applied) {
    suppressNextAutoReward = true;
    previousDiscomfort = driveDiscomfort(engine.tick(0).drives);
  }

  const prefix = source === 'manual' ? 'Prueba manual' : 'Acción del cerebro';
  const note = source === 'manual' ? ' No se enseña al cerebro con esta prueba.' : '';
  worldFeedbackElement.textContent = `${prefix}: ${interaction.message}${note}`;
  recordActivity(source === 'manual' ? 'Prueba manual' : 'Decisión de Nilo', interaction.message);
  renderWorld();
}

function onHabitatCanvasClick(event: MouseEvent): void {
  const point = visuals.screenToWorld(event.clientX, event.clientY);
  if (!point) return;
  const hit = world.hitTestObject(point);
  if (hit && hit.actions[0]) {
    performWorldAction(hit.actions[0], 'manual');
  } else {
    world.walkCreatureTo(point);
    renderWorld();
  }
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
  setSpeech(reward > 0 ? '¡Premio recibido!' : 'Mejor pruebo otra cosa…');
  recordActivity('Supervisión', `${reward > 0 ? 'premio' : 'castigo'} ${reward > 0 ? '+' : '−'}${Math.abs(reward).toFixed(0)} sobre ${decision?.name ?? 'la última decisión'}`);
  renderBrain();
  renderSnapshot(engine.tick(0));
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
    ? `El refuerzo por reducción de malestar solo aprende cuando Nilo está en modo autónomo (ganancia ${DEFAULT_REWARD_GAIN}).`
    : 'Refuerzo automático desactivado: solo cuentan los premios y castigos manuales.';
}

function onAutonomyChange(): void {
  autonomousMode = autonomyToggleElement.checked;
  if (!autonomousMode) {
    const position = world.getSnapshot().creature.position;
    world.moveCreatureTo(position);
    worldFeedbackElement.textContent = 'Modo guiado: Nilo se moverá cuando tú se lo indiques.';
  } else {
    worldFeedbackElement.textContent = 'Modo autónomo: el cerebro decide las acciones de Nilo.';
  }
  renderWorld();
}

function onSpatialStrictChange(): void {
  if (!(spatialStrictToggle instanceof HTMLInputElement)) return;
  spatialStrict = spatialStrictToggle.checked;
  worldFeedbackElement.textContent = spatialStrict
    ? 'Modo espacial estricto activo: Nilo debe alcanzar físicamente cada objeto para recibir su impulso.'
    : 'Modo híbrido activo: Nilo camina hacia el objeto y resuelve la acción en cada intervalo.';
}

function applyRestoredSession(restored: ReturnType<typeof restoreGameState>, statusText: string): void {
  brainModel.dispose();
  genome = restored.genome;
  phenotype = genome.getPhenotype({ ageSeconds: restored.meta.simTime });
  brainModel = restored.brainModel;
  brainRuntime = restored.brainRuntime;
  actionSpace = brainModel.getActions();
  engine = restored.engine;
  brain = brainRuntime.brain;
  vocabulary = restored.vocabulary;
  world = restored.world;

  creatureName = restored.meta.creatureName;
  simTime = restored.meta.simTime;
  frame = restored.meta.frame;
  simulationAccumulator = 0;
  activityLog?.replaceChildren();
  recordActivity('Sesión', statusText);
  autoReward = restored.meta.autoReward;
  spatialStrict = restored.meta.spatialStrict;
  autoRewardElement.checked = autoReward;
  if (spatialStrictToggle instanceof HTMLInputElement) {
    spatialStrictToggle.checked = spatialStrict;
  }

  nextBrainDecision = simTime + BRAIN_DECISION_INTERVAL;
  nextWorldRefresh = simTime;
  nextVocabularyRefresh = simTime;
  suppressNextAutoReward = true;

  const snap = engine.tick(0);
  lastSnapshot = snap;
  previousDiscomfort = driveDiscomfort(snap.drives);
  if (!brain.getDebugState().hasThink) {
    lastBrainOutput = brain.think(brainInputs(snap, frame));
  }
  renderGenomePanel();
  renderVocabulary();
  renderBrain();
  renderWorld();
  renderSnapshot(snap);

  if (persistenceStatus) persistenceStatus.textContent = statusText;
}

function onMutateGenomeClick(): void {
  const seed = BRAIN_SEED + frame * 31 + mutationCounter * 7919;
  mutationCounter += 1;
  const report = genome.mutateStructural(seed, 0.35);
  phenotype = genome.getPhenotype({ ageSeconds: simTime });
  engine.setPhenotype(phenotype);
  renderGenomePanel();
  if (genomeFeedback) {
    const extras = [
      `${report.pointMutations} mutaciones puntuales`,
      report.duplications.length > 0 ? `+${report.duplications.length} duplicaciones (${report.duplications.join(', ')})` : null,
      report.deletions.length > 0 ? `−${report.deletions.length} omisiones (${report.deletions.join(', ')})` : null,
      'genes críticos conservados',
    ].filter(Boolean);
    genomeFeedback.textContent = `Mutación F2 aplicada: ${extras.join(' · ')}.`;
  }
  setSpeech('¡Siento cambiar mis genes!');
}

function onHatchOffspringClick(): void {
  const seed = BRAIN_SEED + frame * 97 + genome.getGeneration() * 104729;
  const hatched = hatchOffspring({
    parentA: genome,
    seed,
    mutationIntensity: 0.25,
    initialChemicals: INITIAL_CHEMICALS,
    initialDrives: INITIAL_DRIVES,
  });
  hatched.meta.autoReward = autoReward;
  hatched.meta.spatialStrict = spatialStrict;
  applyRestoredSession(hatched, `Cría GEN. ${String(hatched.genome.getGeneration()).padStart(2, '0')}`);
  setSpeech(`¡Hola! Soy ${creatureName}.`);
  if (genomeFeedback) {
    genomeFeedback.textContent = `Ha nacido ${creatureName} (generación ${genome.getGeneration()}) por herencia haploide + mutación F2.`;
  }
}

function onSaveGameClick(): void {
  const payload = serializeGameState(
    { genome, engine, brainModel, vocabulary, world },
    { creatureName, simTime, frame, autoReward, spatialStrict },
  );
  const ok = saveGameToStorage(browserStorage, payload);
  if (persistenceFeedback) {
    persistenceFeedback.textContent = ok
      ? `Partida de ${creatureName} guardada en este navegador (${Math.round(payload.length / 1024)} KB).`
      : 'Almacenamiento local no disponible en este entorno; usa «Exportar JSON».';
  }
  if (persistenceStatus && ok) persistenceStatus.textContent = 'Guardada en local';
}

function onLoadGameClick(): void {
  const raw = loadGameFromStorage(browserStorage);
  if (!raw) {
    if (persistenceFeedback) {
      persistenceFeedback.textContent = 'No hay ninguna partida guardada todavía en este navegador.';
    }
    return;
  }
  try {
    const restored = restoreGameState(raw, BRAIN_SEED);
    applyRestoredSession(restored, 'Restaurada');
    setSpeech('¡Te recuerdo!');
    if (persistenceFeedback) {
      persistenceFeedback.textContent = `Partida de ${creatureName} restaurada con éxito en t = ${simTime.toFixed(1)} s.`;
    }
  } catch (error) {
    if (persistenceFeedback) {
      persistenceFeedback.textContent =
        error instanceof Error ? error.message : 'No se pudo restaurar la partida guardada.';
    }
  }
}

function onExportJsonClick(): void {
  const payload = serializeGameState(
    { genome, engine, brainModel, vocabulary, world },
    { creatureName, simTime, frame, autoReward, spatialStrict },
  );
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `creatures-${creatureName.toLowerCase()}-gen${genome.getGeneration()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  if (persistenceFeedback) {
    persistenceFeedback.textContent = `Archivo JSON exportado (${anchor.download}).`;
  }
}

function onImportJsonChange(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    if (persistenceFeedback) persistenceFeedback.textContent = 'El archivo supera el límite de importación de 5 MiB.';
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const restored = restoreGameState(text, BRAIN_SEED);
      applyRestoredSession(restored, 'Importada');
      setSpeech('¡Memoria restaurada!');
      if (persistenceFeedback) {
        persistenceFeedback.textContent = `Partida importada correctamente: ${creatureName} (GEN. ${genome.getGeneration()}).`;
      }
    } catch (error) {
      if (persistenceFeedback) {
        persistenceFeedback.textContent =
          error instanceof Error ? error.message : 'El archivo JSON no es una partida válida.';
      }
    }
    input.value = '';
  };
  reader.readAsText(file);
}

function onResetGameClick(): void {
  clearGameFromStorage(browserStorage);
  const freshGenome = new Genome();
  const freshPhenotype = freshGenome.getPhenotype({ ageSeconds: 0 });
  const freshBrain = new BrainV05({ ...freshPhenotype.brain, seed: BRAIN_SEED });
  const freshRuntime = createBrainRuntime(freshGenome, () => freshBrain);
  const freshEngine = new BiochemEngine({
    initialChemicals: INITIAL_CHEMICALS,
    initialDrives: INITIAL_DRIVES,
    phenotype: freshPhenotype,
  });
  applyRestoredSession(
    {
      genome: freshGenome,
      engine: freshEngine,
      brainModel: freshBrain,
      brainRuntime: freshRuntime,
      vocabulary: new Vocabulary(),
      world: new CreatureWorld(),
      meta: {
        creatureName: 'Nilo',
        simTime: 0,
        frame: 0,
        autoReward: true,
        spatialStrict: false,
      },
    },
    'Reiniciada',
  );
  setSpeech('¡Empezamos de nuevo!');
  if (persistenceFeedback) {
    persistenceFeedback.textContent = 'Partida reiniciada al estado fundacional determinista de Nilo.';
  }
}

let lastRunningSpeed = 1;

function onSpeedShortcut(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select, button, a, [role="button"]'))
  ) return;

  const key = event.key.toLowerCase();
  const speedByKey: Record<string, number> = { '1': 1, '3': 3, '8': 8 };
  if (key === 'p') {
    event.preventDefault();
    const pauseButton = speedButtons.find((candidate) => Number(candidate.dataset.speed) === 0);
    if (timeScale > 0) {
      lastRunningSpeed = timeScale;
      pauseButton?.click();
    } else {
      const resumeButton = speedButtons.find((candidate) => Number(candidate.dataset.speed) === lastRunningSpeed);
      (resumeButton ?? speedButtons.find((candidate) => Number(candidate.dataset.speed) === 1))?.click();
    }
    return;
  }
  const speed = speedByKey[key];
  if (speed === undefined) return;
  const button = speedButtons.find((candidate) => Number(candidate.dataset.speed) === speed);
  if (button) {
    event.preventDefault();
    button.click();
  }
}

window.addEventListener('keydown', onSpeedShortcut);

for (const btn of speedButtons) {
  btn.addEventListener('click', () => {
    const nextSpeed = Number(btn.dataset.speed ?? '1');
    if (!Number.isFinite(nextSpeed) || nextSpeed < 0) return;
    if (nextSpeed > 0) lastRunningSpeed = nextSpeed;
    timeScale = nextSpeed;
    for (const candidate of speedButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === btn));
    }
  });
}

habitatCanvas.addEventListener('click', onHabitatCanvasClick);
teachFormElement.addEventListener('submit', teachWord);
worldActionFormElement.addEventListener('submit', onWorldActionSubmit);
rewardButtonElement.addEventListener('click', onRewardClick);
punishButtonElement.addEventListener('click', onPunishClick);
autoRewardElement.addEventListener('change', onAutoRewardChange);
spatialStrictToggle?.addEventListener('change', onSpatialStrictChange);
autonomyToggleElement.addEventListener('change', onAutonomyChange);
mutateGenomeButton?.addEventListener('click', onMutateGenomeClick);
hatchOffspringButton?.addEventListener('click', onHatchOffspringClick);
saveGameButton?.addEventListener('click', onSaveGameClick);
loadGameButton?.addEventListener('click', onLoadGameClick);
exportJsonButton?.addEventListener('click', onExportJsonClick);
importJsonInput?.addEventListener('change', onImportJsonChange);
resetGameButton?.addEventListener('click', onResetGameClick);

if (persistenceStatus && loadGameFromStorage(browserStorage)) {
  persistenceStatus.textContent = 'Partida disponible en navegador';
}

renderGenomePanel();
renderVocabulary();

const initialSnapshot = engine.tick(0);
let lastSnapshot = initialSnapshot;
previousDiscomfort = driveDiscomfort(initialSnapshot.drives);
lastBrainOutput = brain.think(brainInputs(initialSnapshot, frame));
const initialAction = actionFromValue(actionSpace, lastBrainOutput.actions[0] ?? 0);
// La primera decisión se muestra, pero el modo inicial es guiado: no se ejecuta sola.
void initialAction;
renderSnapshot(initialSnapshot);
renderBrain();
renderWorld();
nextBrainDecision = BRAIN_DECISION_INTERVAL;

function loop(now: number): void {
  const elapsedSeconds = Math.max(0, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // Fixed simulation steps keep chemistry, movement and learning independent
  // of the browser's render rate. Cap catch-up after background-tab stalls.
  const acceptedElapsed = Math.min(elapsedSeconds, 0.25);
  simulationAccumulator = Math.min(
    MAX_SIMULATION_BACKLOG_SECONDS,
    simulationAccumulator + acceptedElapsed * timeScale,
  );

  let snapshot = lastSnapshot;
  let steps = 0;
  while (simulationAccumulator >= SIMULATION_STEP_SECONDS) {
    const dt = SIMULATION_STEP_SECONDS;
    simulationAccumulator -= dt;
    simTime += dt;
    frame += 1;
    steps += 1;

    const stepResult = world.advance(dt);
    if (stepResult.triggeredInteraction) {
      const interaction = stepResult.triggeredInteraction;
      const interactionSource = lastWorldSource;
      if (interaction.applied && interaction.impulse) {
        engine.applyImpulse(interaction.impulse);
        const spoken = recallSpokenWordForObject(interaction.objectId);
        setSpeech(spoken ?? WORLD_ACTION_LABELS[interaction.actionId]);
        if (interactionSource === 'manual') {
          // La interacción manual demorada altera el mundo, pero nunca entrena
          // al cerebro con el efecto de una orden del usuario.
          suppressNextAutoReward = true;
          previousDiscomfort = driveDiscomfort(engine.tick(0).drives);
        }
      }
      const prefix = interactionSource === 'manual' ? 'Prueba manual' : 'Acción del cerebro';
      const note = interactionSource === 'manual' ? ' No se enseña al cerebro con esta prueba.' : '';
      worldFeedbackElement.textContent = `${prefix}: ${interaction.message}${note}`;
      recordActivity(interactionSource === 'manual' ? 'Resultado manual' : 'Resultado', interaction.message);
    }

    snapshot = engine.tick(dt);
    lastSnapshot = snapshot;
    vocabulary.tick(dt);
    const discomfort = driveDiscomfort(snapshot.drives);

    if (!autoReward) previousDiscomfort = discomfort;
    if (simTime >= nextBrainDecision) {
      const skipReward = suppressNextAutoReward;
      suppressNextAutoReward = false;
      if (autoReward && autonomousMode && !skipReward) {
        const reward = driveReductionReward(previousDiscomfort, discomfort);
        brain.reinforce(reward);
        if (Math.abs(reward) >= 0.01) {
          recordActivity('Aprendizaje', `refuerzo automático ${reward >= 0 ? '+' : '−'}${Math.abs(reward).toFixed(2)}`);
        }
      }
      previousDiscomfort = discomfort;

      lastBrainOutput = brain.think(brainInputs(snapshot, frame));
      if (autonomousMode) {
        const selected = actionFromValue(actionSpace, lastBrainOutput.actions[0] ?? 0);
        if (selected) performWorldAction(selected.action.id, 'brain');
      }
      renderBrain();
      nextBrainDecision = simTime + BRAIN_DECISION_INTERVAL;
    }
  }

  // Refresh state changed by manual controls even while simulation is paused.
  if (steps === 0) {
    snapshot = engine.tick(0);
    lastSnapshot = snapshot;
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
  window.removeEventListener('keydown', onSpeedShortcut);
  visuals.unmount();
  brainView?.unmount();
  habitatCanvas.removeEventListener('click', onHabitatCanvasClick);
  teachFormElement.removeEventListener('submit', teachWord);
  worldActionFormElement.removeEventListener('submit', onWorldActionSubmit);
  rewardButtonElement.removeEventListener('click', onRewardClick);
  punishButtonElement.removeEventListener('click', onPunishClick);
  autoRewardElement.removeEventListener('change', onAutoRewardChange);
  spatialStrictToggle?.removeEventListener('change', onSpatialStrictChange);
  autonomyToggleElement.removeEventListener('change', onAutonomyChange);
  mutateGenomeButton?.removeEventListener('click', onMutateGenomeClick);
  hatchOffspringButton?.removeEventListener('click', onHatchOffspringClick);
  saveGameButton?.removeEventListener('click', onSaveGameClick);
  loadGameButton?.removeEventListener('click', onLoadGameClick);
  exportJsonButton?.removeEventListener('click', onExportJsonClick);
  importJsonInput?.removeEventListener('change', onImportJsonChange);
  resetGameButton?.removeEventListener('click', onResetGameClick);
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
