/**
 * Persistencia del servidor público (S2, PLAN-PUBLICO §3).
 *
 * Motor: **`node:sqlite` builtin** (Node ≥ 22.5, cero dependencias nuevas).
 * Almacena el sobre JSON de `serializeGameState()` (una fila) más los extras
 * del servidor que ese sobre no conoce (`tick`, diario y última acción).
 * Checkpoint: cada 5 min y tras cada hito (día/etapa/aprendizaje); al arrancar
 * se restaura si hay fila.
 *
 * FALLBACK DOCUMENTADO: si `node:sqlite` no está disponible o no abre el
 * fichero (o la ruta termina en `.json`), se usa un **fichero JSON atómico**
 * con el mismo contrato. La API `SaveStore` es idéntica para ambos.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

/** Datos persistidos por checkpoint: sobre de partida + extras del servidor. */
export interface NiloSaveData {
  /** `serializeGameState()` (JSON con meta + módulos). */
  envelope: string;
  /** JSON con `{ tick, diary, lastAction }` del servidor; `null` si no hay. */
  extras: string | null;
}

/** Superficie mínima de almacenamiento (la usan servidor y tests). */
export interface SaveStore {
  save(data: NiloSaveData): void;
  /** `null` si no hay ninguna partida guardada. */
  load(): NiloSaveData | null;
  close(): void;
}

const KEY_ENVELOPE = 'envelope';
const KEY_EXTRAS = 'extras';

function openSqliteStore(dbPath: string): SaveStore {
  // Importación diferida (createRequire funciona en ESM): si el builtin no
  // existe en este runtime, cae al fallback JSON en `openSaveStore`.
  const nodeRequire = createRequire(import.meta.url);
  const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS nilo_save (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  const upsert = db.prepare(
    'INSERT INTO nilo_save (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  );
  const remove = db.prepare('DELETE FROM nilo_save WHERE key = ?');
  const select = db.prepare('SELECT value FROM nilo_save WHERE key = ?');

  return {
    save(data: NiloSaveData): void {
      const now = Date.now();
      db.exec('BEGIN IMMEDIATE');
      try {
        upsert.run(KEY_ENVELOPE, data.envelope, now);
        if (data.extras !== null) upsert.run(KEY_EXTRAS, data.extras, now);
        else remove.run(KEY_EXTRAS);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    load(): NiloSaveData | null {
      const row = select.get(KEY_ENVELOPE) as { value?: unknown } | undefined;
      if (!row || typeof row.value !== 'string') return null;
      const extrasRow = select.get(KEY_EXTRAS) as { value?: unknown } | undefined;
      return {
        envelope: row.value,
        extras: typeof extrasRow?.value === 'string' ? extrasRow.value : null,
      };
    },
    close(): void {
      db.close();
    },
  };
}

/** Fallback: fichero JSON atómico (tmp + rename) con el mismo contrato. */
function openJsonSaveStore(dbPath: string): SaveStore {
  const path = resolve(dbPath);
  return {
    save(data: NiloSaveData): void {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(data), 'utf8');
      renameSync(tmp, path);
    },
    load(): NiloSaveData | null {
      if (!existsSync(path)) return null;
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<NiloSaveData>;
        if (typeof parsed.envelope !== 'string') return null;
        return { envelope: parsed.envelope, extras: typeof parsed.extras === 'string' ? parsed.extras : null };
      } catch {
        return null;
      }
    },
    close(): void {
      // Nada que cerrar: escritura atómica por operación.
    },
  };
}

/**
 * Abre la tienda de guardado. Intenta `node:sqlite`; si falla, avisa por
 * consola y cae al fichero JSON documentado (`<ruta>.json`).
 */
export function openSaveStore(dbPath: string): SaveStore {
  if (dbPath.endsWith('.json')) return openJsonSaveStore(dbPath);
  try {
    return openSqliteStore(dbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[nilo] node:sqlite no disponible (${message}); uso el fallback JSON ${dbPath}.json`);
    return openJsonSaveStore(`${dbPath}.json`);
  }
}

/** Ruta del fichero JSON de respaldo creada por el fallback (utilidad/tests). */
export function jsonFallbackPath(dbPath: string): string {
  return `${dbPath}.json`;
}
