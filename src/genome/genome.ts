/**
 * Clase Genome — genoma serializable con mutación determinista (Fase genoma).
 *
 * - Construcción desde GenomeConfig parcial o por defecto (genes registrados
 *   con sus pesos por defecto; seed creadora 0 si no se indica).
 * - `mutate(seed, intensity)`: cada gen sufre un delta derivado del PRNG
 *   mulberry32 escalado por intensity, clamp a su rango (0..1).
 *   Reproducible: mismo genoma + misma semilla + misma intensity ⇒ hijo
 *   idéntico byte a byte. Sin `Math.random()` en el núcleo.
 * - `serialize()` estable: claves de genes ordenadas alfabéticamente.
 *
 * CAPA DE CONFIGURACIÓN: `getPhenotype()` solo calcula efectos; no modifica
 * driveTable.ts ni el cerebro (ver src/contracts/igenome.ts).
 */
import type { GenomeConfig, IGenome, PhenotypeConfig } from '../contracts/igenome';
import { GENOME_SCHEMA_VERSION } from '../contracts/igenome';
import { getGeneDef, hasGene, listGeneDefs } from './genes';
import { computePhenotype, NEUTRAL_GENE } from './phenotype';
import { mulberry32, normalizeSeed, signedDelta } from './prng';

/** Paso máximo de mutación por gen a intensity = 1 (unidad de gen). */
export const MUTATION_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export class Genome implements IGenome {
  private genes: Record<string, number>;
  private schemaVersion: number;
  private seed: number;

  /**
   * @param config configuración parcial; los huecos se rellenan con los
   *   pesos por defecto de los genes registrados.
   * @throws RangeError si algún valor no es un número en 0..1, la seed no es
   *   finita o schemaVersion no es la soportada.
   */
  constructor(config?: Partial<GenomeConfig>) {
    // Base: defaults del registro (orden de registro).
    const genes: Record<string, number> = {};
    for (const def of listGeneDefs()) {
      genes[def.id] = clamp(def.defaultWeight, def.range[0], def.range[1]);
    }
    if (config?.genes !== undefined) {
      if (typeof config.genes !== 'object' || config.genes === null || Array.isArray(config.genes)) {
        throw new RangeError('GenomeConfig.genes debe ser un mapa gen → número');
      }
      for (const [id, value] of Object.entries(config.genes)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new RangeError(`Valor de gen no finito para «${id}»: ${String(value)}`);
        }
        if (value < 0 || value > 1) {
          throw new RangeError(`Valor de gen fuera de 0..1 para «${id}»: ${value}`);
        }
        // Saneado: recorte al rango del gen si está registrado.
        genes[id] = hasGene(id) ? clamp(value, getGeneDef(id).range[0], getGeneDef(id).range[1]) : value;
      }
    }
    this.genes = genes;

    const version = config?.schemaVersion ?? GENOME_SCHEMA_VERSION;
    if (version !== GENOME_SCHEMA_VERSION) {
      throw new RangeError(`schemaVersion no soportada: ${version} (soportada: ${GENOME_SCHEMA_VERSION})`);
    }
    this.schemaVersion = version;
    this.seed = config?.seed === undefined ? 0 : normalizeSeed(config.seed);
  }

  /** Copia independiente con el mismo estado. */
  clone(): Genome {
    return new Genome(this.toConfig());
  }

  /** Config actual normalizada (genoma completo materializado). */
  toConfig(): GenomeConfig {
    return {
      genes: { ...this.genes },
      schemaVersion: this.schemaVersion,
      seed: this.seed,
    };
  }

  /** Serialización estable: claves de genes ordenadas alfabéticamente. */
  serialize(): string {
    const sorted: Record<string, number> = {};
    for (const id of Object.keys(this.genes).sort()) sorted[id] = this.genes[id];
    return JSON.stringify({ genes: sorted, schemaVersion: this.schemaVersion, seed: this.seed });
  }

  /**
   * Valida y carga un JSON de genoma en esta instancia; devuelve la config
   * normalizada (equivalente a `toConfig()` tras la carga).
   * @throws RangeError si el JSON es inválido o no cumple el contrato.
   */
  deserialize(json: string): GenomeConfig {
    if (typeof json !== 'string') throw new RangeError('deserialize espera un string JSON');
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RangeError('JSON de genoma inválido');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new RangeError('Genoma serializado debe ser un objeto JSON');
    }
    const candidate = parsed as Partial<GenomeConfig>;
    const config: GenomeConfig = {
      genes: candidate.genes ?? {},
      schemaVersion: candidate.schemaVersion ?? GENOME_SCHEMA_VERSION,
      seed: candidate.seed ?? 0,
    };
    // El constructor valida todo (genes, versión y seed) y aplica el estado.
    const loaded = new Genome(config);
    const normalized = loaded.toConfig();
    this.genes = { ...normalized.genes };
    this.schemaVersion = normalized.schemaVersion;
    this.seed = normalized.seed;
    return normalized;
  }

  /**
   * Mutación determinista en el sitio. Cada gen recibe
   * `delta = signedDelta(rng) · MUTATION_STEP · intensity` recortado a su
   * rango. El orden de consumo del PRNG es la orden alfabética de los ids,
   * así que la semilla define el hijo completo.
   *
   * @param seed     semilla de mutación (uint32; no confundir con la seed creadora).
   * @param intensity 0 ⇒ sin cambios; se recorta a 0..1.
   * @throws RangeError si seed/intensity no son finitos.
   */
  mutate(seed: number, intensity: number): void {
    if (!Number.isFinite(seed)) throw new RangeError(`Semilla de mutación no finita: ${seed}`);
    if (!Number.isFinite(intensity)) throw new RangeError(`Intensity no finita: ${intensity}`);
    const strength = clamp01(intensity);
    if (strength === 0) return;

    const rng = mulberry32(seed);
    for (const id of Object.keys(this.genes).sort()) {
      const delta = signedDelta(rng) * MUTATION_STEP * strength;
      const [min, max] = hasGene(id) ? getGeneDef(id).range : ([0, 1] as [number, number]);
      this.genes[id] = clamp(this.genes[id] + delta, min, max);
    }
  }

  /**
   * Valor del gen: su valor materializado; si el gen se registró después de
   * construir el genoma, su peso por defecto; desconocido ⇒ RangeError.
   */
  getGene(id: string): number {
    const stored = this.genes[id];
    if (stored !== undefined) return stored;
    if (hasGene(id)) return getGeneDef(id).defaultWeight;
    throw new RangeError(`Gen no registrado: ${id}`);
  }

  /** Resuelve el fenotipo: deltas de decay por drive + knobs del cerebro. */
  getPhenotype(): PhenotypeConfig {
    return computePhenotype((id) => {
      const stored = this.genes[id];
      if (stored !== undefined) return stored;
      if (hasGene(id)) return getGeneDef(id).defaultWeight;
      // Un id sin registrar no tiene efectos: valor neutro (no debería pasar:
      // computePhenotype solo itera genes registrados).
      return NEUTRAL_GENE;
    });
  }
}
