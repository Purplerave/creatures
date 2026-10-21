/** API pública de persistencia coordinada y ciclo de vida (Fase 5). */
export {
  CREATURES_SAVE_VERSION,
  DEFAULT_STORAGE_KEY,
  LINEAGE_NAMES,
  clearGameFromStorage,
  hatchOffspring,
  loadGameFromStorage,
  resolveBrowserStorage,
  resolveLifeStage,
  restoreGameState,
  saveGameToStorage,
  serializeGameState,
} from './saveCoordinator';
export type {
  GameSessionBundle,
  HatchOffspringOptions,
  LifeStageId,
  LifeStageInfo,
  RestoredGameSession,
  SaveEnvelope,
  SaveGameMeta,
  StorageLike,
} from './saveCoordinator';
