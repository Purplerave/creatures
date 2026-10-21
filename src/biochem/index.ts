/**
 * API pública del motor de bioquímica (Fase 0 + serialización Fase 5).
 * Importar desde '../biochem' o './biochem'.
 */
export {
  BiochemEngine,
  BIOCHEM_SCHEMA_VERSION,
  type BiochemEngineOptions,
  type SerializedBiochemState,
} from './engine';
export {
  registerDrive,
  getDriveDef,
  listDriveDefs,
  hasDrive,
  type DriveDef,
  type DriveInfluence,
} from './driveTable';
export {
  registerChemical,
  getChemicalDef,
  listChemicalDefs,
  hasChemical,
  type ChemicalDef,
} from './chemicals';
export {
  CHEMICAL_REACTIONS,
  couplingRate,
  reactionTransfer,
  type ChemicalReaction,
} from './reactions';
