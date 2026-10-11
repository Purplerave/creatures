/**
 * API pública del motor de bioquímica (Fase 0).
 * Importar desde '../biochem' o './biochem'.
 */
export { BiochemEngine, type BiochemEngineOptions } from './engine';
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
