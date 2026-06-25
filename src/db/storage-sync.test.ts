process.env.TESTERS_DB_PATH = ":memory:";

import { afterEach, expect, test } from "bun:test";
import { closeDatabase, resetDatabase } from "./database.js";
import {
  STORAGE_TABLES,
  getStorageStatus,
  parseStorageTables,
} from "./storage-sync.js";
import {
  STORAGE_DATABASE_ENV,
  STORAGE_MODE_ENV,
  getStorageConfig,
  getStorageDatabaseEnvName,
  getStorageDatabaseUrl,
} from "./storage-config.js";

const ENV_NAMES = [
  ...STORAGE_DATABASE_ENV,
  ...STORAGE_MODE_ENV,
] as const;

afterEach(() => {
  for (const name of ENV_NAMES) {
    delete process.env[name];
  }
  closeDatabase();
});

test("storage status reports repo-local testers tables", () => {
  resetDatabase();

  const status = getStorageStatus();

  expect(status.db_path).toBe(":memory:");
  expect(status.tables.map((table) => table.table)).toContain("scenarios");
  expect(status.tables.map((table) => table.table)).toContain("testing_workflows");
  expect(status.tables.find((table) => table.table === "feedback")?.rows).toBe(0);
});

test("storage config prefers canonical database env over fallback", () => {
  process.env["HASNA_TESTERS_DATABASE_URL"] = "postgres://new.example/testers";
  process.env["TESTERS_DATABASE_URL"] = "postgres://fallback.example/testers";

  expect(getStorageDatabaseUrl()).toBe("postgres://new.example/testers");
  expect(getStorageDatabaseEnvName()).toBe("HASNA_TESTERS_DATABASE_URL");
});

test("storage config uses fallback database env and storage mode", () => {
  process.env["TESTERS_DATABASE_URL"] = "postgres://fallback.example/testers";
  process.env["HASNA_TESTERS_STORAGE_MODE"] = "remote";

  expect(getStorageDatabaseUrl()).toBe("postgres://fallback.example/testers");
  expect(getStorageDatabaseEnvName()).toBe("TESTERS_DATABASE_URL");
  expect(getStorageConfig().mode).toBe("remote");
});

test("parseStorageTables defaults to all storage tables", () => {
  expect(parseStorageTables()).toEqual([...STORAGE_TABLES]);
  expect(parseStorageTables("projects,feedback")).toEqual(["projects", "feedback"]);
});
