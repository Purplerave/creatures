/**
 * Contratos base del proyecto Creatures (Fase 0).
 * Tipos compartidos entre bioquímica, cerebro y visuales.
 * Regla: añadir tipos aquí no rompe a nadie; cambiar tipos existentes rompe contratos.
 */

/**
 * Identificador de drive.
 * Los drives viven en una tabla extensible (src/biochem/driveTable.ts), así que
 * el id es una cadena libre validada al registrarse (sin espacios, minúsculas).
 */
export type DriveId = string;

/**
 * Identificador de químico.
 * Igual que DriveId: registro extensible en src/biochem/chemicals.ts.
 */
export type ChemicalId = string;

/**
 * Estado observable de un drive en un instante dado.
 * `level` es el valor vivo (integrado); `target` es hacia dónde se dirige
 * según el empuje intrínseco + acoplamientos del último tick.
 */
export interface DriveState {
  /** Nivel actual del drive, siempre dentro de su clamp (0..1 por defecto). */
  level: number;
  /** Nivel hacia el que se dirige el drive (predicción determinista a 1 s). */
  target: number;
}

/**
 * Resultado completo de un tick del motor de bioquímica.
 * Snapshot inmutable (copias) → seguro de leer desde el cerebro/visuales.
 */
export interface TickResult {
  /** Duración integrada en segundos. */
  dt: number;
  /** Estado de todos los drives registrados al cierre del tick. */
  drives: Record<DriveId, DriveState>;
  /** Niveles de todos los químicos registrados al cierre del tick (0..1). */
  chemicals: Record<ChemicalId, number>;
}

/**
 * Impulso instantáneo causado por una interacción del mundo (comida, descanso,
 * juego, etc.). Cada valor es un delta; el motor valida ids/rangos, recorta a
 * los clamps de cada entidad y aplica el lote de forma atómica.
 */
export interface BiochemicalImpulse {
  drives?: Partial<Record<DriveId, number>>;
  chemicals?: Partial<Record<ChemicalId, number>>;
}
