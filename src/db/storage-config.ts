import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type StorageMode = "local" | "remote" | "hybrid";

export interface StorageConfig {
  mode: StorageMode;
  rds: {
    host: string;
    port: number;
    username: string;
    password_env: string;
    ssl: boolean;
  };
}

const STORAGE_CONFIG_PATH = join(homedir(), ".hasna", "testers", "storage", "config.json");

export const TESTERS_STORAGE_ENV = "HASNA_TESTERS_DATABASE_URL";
export const TESTERS_STORAGE_FALLBACK_ENV = "TESTERS_DATABASE_URL";
export const TESTERS_STORAGE_MODE_ENV = "HASNA_TESTERS_STORAGE_MODE";
export const TESTERS_STORAGE_MODE_FALLBACK_ENV = "TESTERS_STORAGE_MODE";
export const STORAGE_DATABASE_ENV = [TESTERS_STORAGE_ENV, TESTERS_STORAGE_FALLBACK_ENV] as const;
export const STORAGE_MODE_ENV = [TESTERS_STORAGE_MODE_ENV, TESTERS_STORAGE_MODE_FALLBACK_ENV] as const;

function firstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function normalizeMode(value: string | undefined): StorageMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "local" || normalized === "remote" || normalized === "hybrid") return normalized;
  return null;
}

export function getStorageDatabaseUrl(): string | undefined {
  return firstEnv(STORAGE_DATABASE_ENV);
}

export function getStorageDatabaseEnvName(): (typeof STORAGE_DATABASE_ENV)[number] | null {
  for (const name of STORAGE_DATABASE_ENV) {
    if (process.env[name]) return name;
  }
  return null;
}

export function getStorageConfig(): StorageConfig {
  const config: StorageConfig = {
    mode: "local",
    rds: {
      host: "",
      port: 5432,
      username: "",
      password_env: "TESTERS_DATABASE_PASSWORD",
      ssl: true,
    },
  };

  if (existsSync(STORAGE_CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(STORAGE_CONFIG_PATH, "utf-8")) as Partial<StorageConfig>;
      config.mode = normalizeMode(raw.mode) ?? config.mode;
      config.rds = { ...config.rds, ...(raw.rds ?? {}) };
    } catch {
      // Ignore malformed global storage config and keep local mode.
    }
  }

  const modeOverride = normalizeMode(firstEnv(STORAGE_MODE_ENV));
  if (modeOverride) {
    config.mode = modeOverride;
  } else if (getStorageDatabaseUrl() && config.mode === "local") {
    config.mode = "hybrid";
  }

  return config;
}

export function getStorageConnectionString(dbName = "testers"): string {
  const direct = getStorageDatabaseUrl();
  if (direct) return direct;

  const config = getStorageConfig();
  const { host, port, username, password_env, ssl } = config.rds;
  if (!host || !username) {
    throw new Error("Remote storage database is not configured. Set HASNA_TESTERS_DATABASE_URL or configure ~/.hasna/testers/storage/config.json.");
  }

  const password = process.env[password_env];
  if (!password) {
    throw new Error(`Remote storage database password is not set. Export ${password_env}.`);
  }

  const sslParam = ssl ? "?sslmode=require" : "";
  return `postgres://${username}:${encodeURIComponent(password)}@${host}:${port}/${dbName}${sslParam}`;
}

export function getConnectionString(dbName = "testers"): string {
  return getStorageConnectionString(dbName);
}
