/** API pública del mundo espacial y de eventos (Fase 4 + Fase 5). */
export {
  CreatureWorld,
  WORLD_OBJECTS,
  WORLD_ACTION_LABELS,
  WORLD_SCHEMA_VERSION,
  DEFAULT_WALK_SPEED,
  INITIAL_CREATURE_POSITION,
} from './world';
export type {
  CreatureBodyState,
  CreatureWorldOptions,
  PerformActionOptions,
  Vec2,
  WorldActionId,
  WorldActionResult,
  WorldObjectDefinition,
  WorldObjectId,
  WorldObjectState,
  WorldSnapshot,
  WorldStepResult,
} from './world';
