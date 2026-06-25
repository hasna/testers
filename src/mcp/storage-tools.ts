import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getStorageStatus,
  parseStorageTables,
  pullStorageChanges,
  pushStorageChanges,
  syncStorageChanges,
} from "../db/storage-sync.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown) {
  return {
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
    isError: true,
  };
}

export function registerTestersStorageTools(server: McpServer): void {
  server.tool(
    "testers_storage_status",
    "Show testers local database and remote storage sync status",
    {},
    async () => {
      try {
        return ok(getStorageStatus());
      } catch (error) {
        return err(error);
      }
    }
  );

  server.tool(
    "testers_storage_push",
    "Push local testers data to remote PostgreSQL storage",
    { tables: z.string().optional().describe("Comma-separated table names") },
    async ({ tables }) => {
      try {
        return ok(await pushStorageChanges(parseStorageTables(tables)));
      } catch (error) {
        return err(error);
      }
    }
  );

  server.tool(
    "testers_storage_pull",
    "Pull remote PostgreSQL storage data into the local database",
    { tables: z.string().optional().describe("Comma-separated table names") },
    async ({ tables }) => {
      try {
        return ok(await pullStorageChanges(parseStorageTables(tables)));
      } catch (error) {
        return err(error);
      }
    }
  );

  server.tool(
    "testers_storage_sync",
    "Push local changes, then pull remote changes",
    { tables: z.string().optional().describe("Comma-separated table names") },
    async ({ tables }) => {
      try {
        return ok(await syncStorageChanges(parseStorageTables(tables)));
      } catch (error) {
        return err(error);
      }
    }
  );
}
