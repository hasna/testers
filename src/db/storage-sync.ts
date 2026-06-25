import type { Database } from "bun:sqlite";
import { getStorageConfig, getStorageConnectionString } from "./storage-config.js";
import { getDatabase, getTestersDbPath } from "./database.js";
import { PG_MIGRATIONS } from "./pg-migrations.js";
import { PgAdapterAsync } from "./remote-storage.js";

type Row = Record<string, unknown>;

export interface StorageSyncResult {
  table: string;
  direction: "push" | "pull";
  rowsRead: number;
  rowsWritten: number;
  errors: string[];
}

export interface StorageStatus {
  mode: string;
  enabled: boolean;
  db_path: string;
  tables: Array<{ table: string; rows: number }>;
}

export type SyncResult = StorageSyncResult;

export const STORAGE_TABLES = [
  "projects",
  "agents",
  "scenarios",
  "runs",
  "results",
  "screenshots",
  "schedules",
  "auth_presets",
  "webhooks",
  "scenario_dependencies",
  "flows",
  "environments",
  "scan_issues",
  "api_checks",
  "api_check_results",
  "personas",
  "golden_answers",
  "golden_check_results",
  "feedback",
  "step_results",
  "sessions",
  "testing_workflows",
] as const;
export const TESTERS_STORAGE_TABLES = STORAGE_TABLES;

const TABLE_KEYS: Record<string, string[]> = {
  projects: ["id"],
  agents: ["id"],
  scenarios: ["id"],
  runs: ["id"],
  results: ["id"],
  screenshots: ["id"],
  schedules: ["id"],
  auth_presets: ["id"],
  webhooks: ["id"],
  scenario_dependencies: ["scenario_id", "depends_on"],
  flows: ["id"],
  environments: ["id"],
  scan_issues: ["id"],
  api_checks: ["id"],
  api_check_results: ["id"],
  personas: ["id"],
  golden_answers: ["id"],
  golden_check_results: ["id"],
  feedback: ["id"],
  step_results: ["id"],
  sessions: ["id"],
  testing_workflows: ["id"],
};

const BOOLEAN_COLUMNS: Record<string, string[]> = {
  scenarios: ["requires_auth"],
  runs: ["headed", "is_baseline"],
  schedules: ["headed", "enabled"],
  webhooks: ["active"],
  environments: ["is_default"],
  api_checks: ["enabled"],
  personas: ["enabled"],
  golden_answers: ["enabled"],
  golden_check_results: ["passed", "drift_detected"],
  testing_workflows: ["enabled"],
};

function quoteId(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toPgRow(table: string, row: Row): Row {
  const copy = { ...row };
  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    if (column in copy) copy[column] = Boolean(copy[column]);
  }
  return copy;
}

function toSqliteRow(table: string, row: Row): Row {
  const copy = { ...row };
  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    if (column in copy) copy[column] = copy[column] ? 1 : 0;
  }
  return copy;
}

async function getRemoteColumns(remote: PgAdapterAsync, table: string): Promise<Set<string>> {
  const rows = await remote.all(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    table
  ) as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}

function getSqliteColumns(db: Database, table: string): Set<string> {
  const rows = db.query(`PRAGMA table_info(${quoteId(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

async function upsertPg(remote: PgAdapterAsync, table: string, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;

  const remoteColumns = await getRemoteColumns(remote, table);
  const keyColumns = TABLE_KEYS[table] ?? ["id"];
  let written = 0;

  for (const rawRow of rows) {
    const row = toPgRow(table, rawRow);
    const columns = Object.keys(row).filter((column) => remoteColumns.has(column));
    if (keyColumns.some((column) => !columns.includes(column))) continue;

    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const updateColumns = columns.filter((column) => !keyColumns.includes(column));
    const updateClause = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteId(column)} = EXCLUDED.${quoteId(column)}`).join(", ")}`
      : "DO NOTHING";

    await remote.run(
      `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (${keyColumns.map(quoteId).join(", ")}) ${updateClause}`,
      ...values
    );
    written++;
  }

  return written;
}

function upsertSqlite(db: Database, table: string, rows: Row[]): number {
  const sqliteColumns = getSqliteColumns(db, table);
  const keyColumns = TABLE_KEYS[table] ?? ["id"];
  let written = 0;

  for (const rawRow of rows) {
    const row = toSqliteRow(table, rawRow);
    const columns = Object.keys(row).filter((column) => sqliteColumns.has(column));
    if (keyColumns.some((column) => !columns.includes(column))) continue;

    const updateColumns = columns.filter((column) => !keyColumns.includes(column));
    const updateClause = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${quoteId(column)} = excluded.${quoteId(column)}`).join(", ")}`
      : "DO NOTHING";

    db.query(
      `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})
       ON CONFLICT(${keyColumns.map(quoteId).join(", ")}) ${updateClause}`
    ).run(...(columns.map((column) => row[column]) as any[]));
    written++;
  }

  return written;
}

export async function getStoragePg(): Promise<PgAdapterAsync> {
  return new PgAdapterAsync(getStorageConnectionString("testers"));
}

export async function runStorageMigrations(remote: PgAdapterAsync): Promise<void> {
  for (const migration of PG_MIGRATIONS) {
    await remote.exec(migration);
  }
}

export function getStorageStatus(db: Database = getDatabase()): StorageStatus {
  const config = getStorageConfig();
  return {
    mode: config.mode,
    enabled: config.mode === "hybrid" || config.mode === "remote",
    db_path: getTestersDbPath(),
    tables: STORAGE_TABLES.map((table) => {
      try {
        const row = db.query(`SELECT COUNT(*) as count FROM ${quoteId(table)}`).get() as { count: number };
        return { table, rows: row.count };
      } catch {
        return { table, rows: 0 };
      }
    }),
  };
}

export async function pushStorageChanges(tables: string[] = [...STORAGE_TABLES]): Promise<StorageSyncResult[]> {
  const db = getDatabase();
  const remote = await getStoragePg();
  const results: StorageSyncResult[] = [];

  try {
    await runStorageMigrations(remote);
    for (const table of tables) {
      const result: StorageSyncResult = { table, direction: "push", rowsRead: 0, rowsWritten: 0, errors: [] };
      try {
        const rows = db.query(`SELECT * FROM ${quoteId(table)}`).all() as Row[];
        result.rowsRead = rows.length;
        result.rowsWritten = await upsertPg(remote, table, rows);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
      results.push(result);
    }
  } finally {
    await remote.close();
  }

  return results;
}

export async function pullStorageChanges(tables: string[] = [...STORAGE_TABLES]): Promise<StorageSyncResult[]> {
  const db = getDatabase();
  const remote = await getStoragePg();
  const results: StorageSyncResult[] = [];

  try {
    await runStorageMigrations(remote);
    for (const table of tables) {
      const result: StorageSyncResult = { table, direction: "pull", rowsRead: 0, rowsWritten: 0, errors: [] };
      try {
        const rows = await remote.all(`SELECT * FROM ${quoteId(table)}`) as Row[];
        result.rowsRead = rows.length;
        result.rowsWritten = upsertSqlite(db, table, rows);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
      results.push(result);
    }
  } finally {
    await remote.close();
  }

  return results;
}

export async function syncStorageChanges(tables: string[] = [...STORAGE_TABLES]): Promise<{ push: StorageSyncResult[]; pull: StorageSyncResult[] }> {
  return {
    push: await pushStorageChanges(tables),
    pull: await pullStorageChanges(tables),
  };
}

export function parseStorageTables(raw?: string): string[] {
  if (!raw) return [...STORAGE_TABLES];
  const requested = raw.split(",").map((table) => table.trim()).filter(Boolean);
  return requested.length > 0 ? requested : [...STORAGE_TABLES];
}
