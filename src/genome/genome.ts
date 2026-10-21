/**
 * Clase Genome — genoma serializable con mutación determinista, cabeceras
 * ricas estilo Creatures (F2), duplicación/omisión de loci, metilación
 * epigenética reversible (1 bit por gen/locus) y cruce haploide `crossover()`.
 *
 * Invariantes preservados al 100 %:
 * - Un genoma sin cambios estructurales ni marcas epigenéticas produce
 *   EXACTAMENTE el mismo string JSON en `serialize()` y el mismo resultado
 *   bit a bit en `mutate(seed, intensity)` que en Fase genoma.
 * - Los genes con `header.critical === true` nunca pierden su copia primaria
 *   (`copyIndex === 0`) en mutaciones estructurales, pero sus copias
 *   duplicadas (`copyIndex >= 1`) sí pueden mutar libremente o eliminarse
 *   (Regla #2 de `docs/VISION-SUPER-BESTIA.md`).
 * - Cero `Math.random()`: todo azar pasa por `mulberry32(seed)`.
 */
import type {
  GeneLocus,
  GenomeConfig,
  IGenome,
  PhenotypeConfig,
  PhenotypeEvalOptions,
} from '../contracts/igenome';
import { GENOME_SCHEMA_VERSION } from '../contracts/igenome';
import {
  getGeneDef,
  hasGene,
  listGeneDefs,
  MAX_GENE_MUTABILITY,
  resolveGeneHeader,
} from './genes';
import { computePhenotype, NEUTRAL_GENE } from './phenotype';
import { mulberry32, normalizeSeed, signedDelta } from './prng';

/** Paso máximo de mutación por gen a intensity = 1 (unidad de gen). */
export const MUTATION_STEP = 0.25;

/** Probabilidad base de duplicación por locus elegible a `intensity = 1`. */
export const DEFAULT_DUPLICATION_RATE = 0.12;
/** Probabilidad base de omisión/borrado por locus elegible a `intensity = 1`. */
export const DEFAULT_DELETION_RATE = 0.08;
/** Tope de copias por gen para evitar explosión combinatoria en sesiones largas. */
export const MAX_COPIES_PER_GENE = 4;

/** Opciones de mutación estructural estilo Creatures (F2). */
export interface StructuralMutationOptions {
  /** Tasa de duplicación a intensity = 1 (por defecto `DEFAULT_DUPLICATION_RATE`). */
  duplicationRate?: number;
  /** Tasa de omisión a intensity = 1 (por defecto `DEFAULT_DELETION_RATE`). */
  deletionRate?: number;
  /** Máximo de copias por gen (por defecto `MAX_COPIES_PER_GENE`). */
  maxCopiesPerGene?: number;
}

/** Resumen observable de una pasada de `mutateStructural()`. */
export interface StructuralMutationReport {
  pointMutations: number;
  duplications: string[];
  deletions: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function cloneLocus(locus: GeneLocus): GeneLocus {
  return { ...locus };
}

export class Genome implements IGenome {
  private genes: Record<string, number>;
  private schemaVersion: number;
  private seed: number;
  private generation: number;
  /** `null` mientras no haya divergencia estructural respecto a `genes` plano. */
  private loci: GeneLocus[] | null = null;
  private readonly methylated = new Set<string>();

  /**
   * @param config configuración parcial; los huecos se rellenan con los
   *   pesos por defecto de los genes registrados.
   * @throws RangeError si algún valor no es un número en 0..1, la seed no es
   *   finita o schemaVersion no es la soportada.
   */
  constructor(config?: Partial<GenomeConfig>) {
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

    const generation = config?.generation ?? 1;
    if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) {
      throw new RangeError(`generation inválida: ${String(config?.generation)} (entero ≥ 1)`);
    }
    this.generation = generation;

    if (config?.methylated !== undefined) {
      if (!Array.isArray(config.methylated)) {
        throw new RangeError('GenomeConfig.methylated debe ser un array de strings');
      }
      for (const id of config.methylated) {
        if (typeof id !== 'string' || !id.trim()) {
          throw new RangeError(`Marca de metilación inválida: ${String(id)}`);
        }
        this.methylated.add(id);
      }
    }

    if (config?.loci !== undefined) {
      if (!Array.isArray(config.loci)) {
        throw new RangeError('GenomeConfig.loci debe ser un array');
      }
      const validated: GeneLocus[] = [];
      const seenLocusIds = new Set<string>();
      for (const raw of config.loci) {
        if (typeof raw !== 'object' || raw === null) {
          throw new RangeError('Locus inválido en GenomeConfig.loci');
        }
        if (typeof raw.locusId !== 'string' || !raw.locusId.trim()) {
          throw new RangeError('locusId inválido en GenomeConfig.loci');
        }
        if (seenLocusIds.has(raw.locusId)) {
          throw new RangeError(`locusId duplicado: ${raw.locusId}`);
        }
        if (typeof raw.geneId !== 'string' || !raw.geneId.trim()) {
          throw new RangeError(`geneId inválido en locus ${raw.locusId}`);
        }
        if (typeof raw.copyIndex !== 'number' || !Number.isInteger(raw.copyIndex) || raw.copyIndex < 0) {
          throw new RangeError(`copyIndex inválido en locus ${raw.locusId}`);
        }
        if (typeof raw.value !== 'number' || !Number.isFinite(raw.value) || raw.value < 0 || raw.value > 1) {
          throw new RangeError(`Valor fuera de 0..1 en locus ${raw.locusId}: ${String(raw.value)}`);
        }
        const [min, max] = hasGene(raw.geneId) ? getGeneDef(raw.geneId).range : ([0, 1] as [number, number]);
        seenLocusIds.add(raw.locusId);
        validated.push({
          locusId: raw.locusId,
          geneId: raw.geneId,
          copyIndex: raw.copyIndex,
          value: clamp(raw.value, min, max),
          methylated: Boolean(raw.methylated),
        });
      }
      // Garantía de integridad crítica: ningún gen crítico registrado puede quedar sin copia 0.
      for (const def of listGeneDefs()) {
        const header = resolveGeneHeader(def);
        if (header.critical && !validated.some((locus) => locus.geneId === def.id && locus.copyIndex === 0)) {
          validated.push({
            locusId: def.id,
            geneId: def.id,
            copyIndex: 0,
            value: this.genes[def.id] ?? def.defaultWeight,
            methylated: this.methylated.has(def.id),
          });
        }
      }
      this.loci = validated;
      this.syncGenesFromLoci();
    }
  }

  /** Copia independiente con el mismo estado (incluidos loci, generación y metilación). */
  clone(): Genome {
    return new Genome(this.toConfig());
  }

  /** Generación actual dentro de la estirpe (1 = fundador). */
  getGeneration(): number {
    return this.generation;
  }

  /** Incrementa o fija la generación (entero ≥ 1). */
  setGeneration(generation: number): void {
    if (!Number.isInteger(generation) || generation < 1) {
      throw new RangeError(`generation inválida: ${String(generation)}`);
    }
    this.generation = generation;
  }

  /** Lista de loci efectivos (copias defensivas) en orden estable. */
  getLoci(): GeneLocus[] {
    if (this.loci) return this.loci.map(cloneLocus);
    return Object.keys(this.genes)
      .sort()
      .map((geneId) => ({
        locusId: geneId,
        geneId,
        copyIndex: 0,
        value: this.genes[geneId]!,
        methylated: this.methylated.has(geneId),
      }));
  }

  /** Activa o limpia el bit epigenético de metilación reversible sobre un gen o locus. */
  setMethylation(id: string, methylated: boolean): void {
    if (typeof id !== 'string' || !id.trim()) {
      throw new RangeError(`Id inválido para metilación: «${String(id)}»`);
    }
    const matchingLocus = this.loci?.find((locus) => locus.locusId === id || locus.geneId === id);
    if (!hasGene(id) && this.genes[id] === undefined && !matchingLocus) {
      throw new RangeError(`Gen o locus desconocido para metilación: ${id}`);
    }
    if (methylated) {
      this.methylated.add(id);
    } else {
      this.methylated.delete(id);
    }
    if (this.loci) {
      for (const locus of this.loci) {
        if (locus.locusId === id || locus.geneId === id) {
          locus.methylated = methylated;
        }
      }
    }
  }

  /** Consulta si un gen o locus está actualmente silenciado por metilación. */
  isMethylated(id: string): boolean {
    if (this.methylated.has(id)) return true;
    if (this.loci) {
      const matching = this.loci.filter((locus) => locus.locusId === id || locus.geneId === id);
      return matching.length > 0 && matching.every((locus) => locus.methylated);
    }
    return false;
  }

  /** Lista ordenada de marcas de metilación activas. */
  listMethylated(): string[] {
    const out = new Set<string>(this.methylated);
    if (this.loci) {
      for (const locus of this.loci) {
        if (locus.methylated) out.add(locus.locusId);
      }
    }
    return [...out].sort();
  }

  /** Config actual normalizada (genoma completo materializado). */
  toConfig(): GenomeConfig {
    const base: GenomeConfig = {
      genes: { ...this.genes },
      schemaVersion: this.schemaVersion,
      seed: this.seed,
    };
    if (this.generation !== 1) base.generation = this.generation;
    if (this.loci !== null) base.loci = this.loci.map(cloneLocus);
    const methylated = this.listMethylated();
    if (methylated.length > 0) base.methylated = methylated;
    return base;
  }

  /**
   * Serialización estable: claves de genes ordenadas alfabéticamente.
   * Si no hay metadatos F2 no triviales, emite exactamente `{ genes, schemaVersion, seed }`
   * para conservar compatibilidad byte a byte con Fase genoma.
   */
  serialize(): string {
    const sorted: Record<string, number> = {};
    for (const id of Object.keys(this.genes).sort()) sorted[id] = this.genes[id]!;
    const payload: Record<string, unknown> = {
      genes: sorted,
      schemaVersion: this.schemaVersion,
      seed: this.seed,
    };
    if (this.generation !== 1) payload.generation = this.generation;
    if (this.loci !== null) payload.loci = this.loci.map(cloneLocus);
    const methylated = this.listMethylated();
    if (methylated.length > 0) payload.methylated = methylated;
    return JSON.stringify(payload);
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
      generation: candidate.generation,
      loci: candidate.loci,
      methylated: candidate.methylated,
    };
    const loaded = new Genome(config);
    const normalized = loaded.toConfig();
    this.genes = { ...normalized.genes };
    this.schemaVersion = normalized.schemaVersion;
    this.seed = normalized.seed;
    this.generation = loaded.generation;
    this.loci = loaded.loci ? loaded.loci.map(cloneLocus) : null;
    this.methylated.clear();
    for (const id of loaded.methylated) this.methylated.add(id);
    return normalized;
  }

  /**
   * Mutación determinista en el sitio. Cada gen recibe
   * `delta = signedDelta(rng) · MUTATION_STEP · intensity · (mutability / 255)`
   * recortado a su rango (0 si `header.mutable === false`).
   * Con cabeceras por defecto (`mutability = 255`, `mutable = true`), el
   * resultado es idéntico bit a bit a Fase genoma.
   */
  mutate(seed: number, intensity: number): void {
    if (!Number.isFinite(seed)) throw new RangeError(`Semilla de mutación no finita: ${seed}`);
    if (!Number.isFinite(intensity)) throw new RangeError(`Intensity no finita: ${intensity}`);
    const strength = clamp01(intensity);
    if (strength === 0) return;

    const rng = mulberry32(seed);
    for (const id of Object.keys(this.genes).sort()) {
      const rawDelta = signedDelta(rng);
      const def = hasGene(id) ? getGeneDef(id) : null;
      const header = def ? resolveGeneHeader(def) : null;
      if (header && !header.mutable) continue;
      const weightScale = header ? header.mutability / MAX_GENE_MUTABILITY : 1;
      const delta = rawDelta * MUTATION_STEP * strength * weightScale;
      const [min, max] = def ? def.range : ([0, 1] as [number, number]);
      this.genes[id] = clamp(this.genes[id]! + delta, min, max);
    }

    if (this.loci) {
      for (const locus of this.loci) {
        if (locus.copyIndex === 0 && this.genes[locus.geneId] !== undefined) {
          locus.value = this.genes[locus.geneId]!;
        } else {
          const def = hasGene(locus.geneId) ? getGeneDef(locus.geneId) : null;
          const [min, max] = def ? def.range : ([0, 1] as [number, number]);
          locus.value = clamp(locus.value + signedDelta(rng) * MUTATION_STEP * strength, min, max);
        }
      }
      this.syncGenesFromLoci();
    }
  }

  /**
   * Mutación estructural estilo Creatures (F2):
   * 1. Mutación puntual ponderada por `mutability` (los duplicados `copyIndex > 0`
   *    siempre son mutables aunque la copia original sea conservadora).
   * 2. Omisión/borrado determinista: NUNCA elimina la copia `copyIndex === 0` de
   *    un gen `critical` ni loci con `deletable === false`, pero SÍ permite perder
   *    duplicados redundantes.
   * 3. Duplicación determinista sobre loci `dupable` hasta `maxCopiesPerGene`.
   */
  mutateStructural(
    seed: number,
    intensity: number,
    options: StructuralMutationOptions = {},
  ): StructuralMutationReport {
    if (!Number.isFinite(seed)) throw new RangeError(`Semilla de mutación no finita: ${seed}`);
    if (!Number.isFinite(intensity)) throw new RangeError(`Intensity no finita: ${intensity}`);
    const strength = clamp01(intensity);
    const report: StructuralMutationReport = { pointMutations: 0, duplications: [], deletions: [] };
    if (strength === 0) return report;

    const duplicationRate = clamp01(options.duplicationRate ?? DEFAULT_DUPLICATION_RATE);
    const deletionRate = clamp01(options.deletionRate ?? DEFAULT_DELETION_RATE);
    const maxCopiesPerGene = Math.max(1, Math.floor(options.maxCopiesPerGene ?? MAX_COPIES_PER_GENE));

    const rng = mulberry32(seed);
    const working = this.getLoci();

    // 1) Mutación puntual sobre cada locus.
    for (const locus of working) {
      const def = hasGene(locus.geneId) ? getGeneDef(locus.geneId) : null;
      const header = def ? resolveGeneHeader(def) : null;
      const raw = signedDelta(rng);
      const canMutate = locus.copyIndex > 0 || (header ? header.mutable : true);
      if (!canMutate) continue;
      const scale = locus.copyIndex > 0 ? 1 : header ? header.mutability / MAX_GENE_MUTABILITY : 1;
      if (scale === 0) continue;
      const [min, max] = def ? def.range : ([0, 1] as [number, number]);
      const next = clamp(locus.value + raw * MUTATION_STEP * strength * scale, min, max);
      if (next !== locus.value) {
        locus.value = next;
        report.pointMutations += 1;
      }
    }

    // 2) Omisión estructural (respeta protección crítica en copyIndex === 0).
    const survivors: GeneLocus[] = [];
    for (const locus of working) {
      const def = hasGene(locus.geneId) ? getGeneDef(locus.geneId) : null;
      const header = def ? resolveGeneHeader(def) : null;
      const draw = rng();
      const canDelete =
        locus.copyIndex > 0 ? true : header ? !header.critical && header.deletable : true;
      if (canDelete && draw < deletionRate * strength) {
        report.deletions.push(locus.locusId);
        this.methylated.delete(locus.locusId);
        continue;
      }
      survivors.push(locus);
    }

    // 3) Duplicación estructural de genes `dupable`.
    const additions: GeneLocus[] = [];
    for (const locus of survivors) {
      const def = hasGene(locus.geneId) ? getGeneDef(locus.geneId) : null;
      const header = def ? resolveGeneHeader(def) : null;
      const draw = rng();
      const dupable = header ? header.dupable : true;
      const existingCount =
        survivors.filter((item) => item.geneId === locus.geneId).length +
        additions.filter((item) => item.geneId === locus.geneId).length;
      if (dupable && existingCount < maxCopiesPerGene && draw < duplicationRate * strength) {
        const nextCopyIndex =
          Math.max(
            0,
            ...survivors.filter((item) => item.geneId === locus.geneId).map((item) => item.copyIndex),
            ...additions.filter((item) => item.geneId === locus.geneId).map((item) => item.copyIndex),
          ) + 1;
        const [min, max] = def ? def.range : ([0, 1] as [number, number]);
        const duplicatedValue = clamp(
          locus.value + signedDelta(rng) * MUTATION_STEP * 0.5 * strength,
          min,
          max,
        );
        const dupLocus: GeneLocus = {
          locusId: `${locus.geneId}#${nextCopyIndex}`,
          geneId: locus.geneId,
          copyIndex: nextCopyIndex,
          value: duplicatedValue,
          // Memoria ambiental epigenética: hereda la metilación parental por defecto.
          methylated: locus.methylated,
        };
        additions.push(dupLocus);
        report.duplications.push(dupLocus.locusId);
      }
    }

    this.loci = [...survivors, ...additions];
    this.syncGenesFromLoci();
    return report;
  }

  /**
   * Herencia haploide gen-a-gen estilo Creatures entre dos progenitores +
   * mutación opcional, completamente determinista por `seed`.
   */
  static crossover(
    parentA: Genome,
    parentB: Genome,
    seed: number,
    mutationIntensity = 0.15,
  ): Genome {
    const normalizedSeed = normalizeSeed(seed);
    const rng = mulberry32(normalizedSeed);
    const lociA = parentA.getLoci();
    const lociB = parentB.getLoci();
    const allGeneIds = [
      ...new Set([...lociA.map((l) => l.geneId), ...lociB.map((l) => l.geneId)]),
    ].sort();

    const childLoci: GeneLocus[] = [];
    const childGenes: Record<string, number> = {};

    for (const geneId of allGeneIds) {
      const fromFirst = rng() < 0.5;
      const sourceLoci = (fromFirst ? lociA : lociB).filter((locus) => locus.geneId === geneId);
      const fallbackLoci = (fromFirst ? lociB : lociA).filter((locus) => locus.geneId === geneId);
      const chosen = sourceLoci.length > 0 ? sourceLoci : fallbackLoci;
      for (const locus of chosen) {
        childLoci.push(cloneLocus(locus));
      }
      if (chosen[0]) {
        childGenes[geneId] = chosen[0].value;
      }
    }

    const hasStructuralDivergence =
      parentA.loci !== null ||
      parentB.loci !== null ||
      childLoci.some((locus) => locus.copyIndex > 0 || locus.methylated);

    const child = new Genome({
      genes: childGenes,
      seed: normalizedSeed,
      generation: Math.max(parentA.getGeneration(), parentB.getGeneration()) + 1,
      loci: hasStructuralDivergence ? childLoci : undefined,
      methylated: childLoci.filter((locus) => locus.methylated).map((locus) => locus.locusId),
    });

    if (mutationIntensity > 0) {
      child.mutateStructural(normalizedSeed ^ 0x9e3779b9, mutationIntensity);
    }
    return child;
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
  getPhenotype(options?: PhenotypeEvalOptions): PhenotypeConfig {
    const hasExtendedContext =
      options?.ageSeconds !== undefined || this.loci !== null || this.methylated.size > 0;
    return computePhenotype(
      (id) => {
        const stored = this.genes[id];
        if (stored !== undefined) return stored;
        if (hasGene(id)) return getGeneDef(id).defaultWeight;
        return NEUTRAL_GENE;
      },
      hasExtendedContext
        ? {
            ageSeconds: options?.ageSeconds,
            loci: this.loci ?? undefined,
            methylated: this.methylated,
          }
        : undefined,
    );
  }

  private syncGenesFromLoci(): void {
    if (!this.loci) return;
    const grouped = new Map<string, number[]>();
    for (const locus of this.loci) {
      const bucket = grouped.get(locus.geneId) ?? [];
      bucket.push(locus.value);
      grouped.set(locus.geneId, bucket);
    }
    for (const [geneId, values] of grouped) {
      this.genes[geneId] = values.reduce((sum, item) => sum + item, 0) / values.length;
    }
  }
}
