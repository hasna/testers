import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("testers storage MCP contract", () => {
  it("registers storage tools", () => {
    const toolsSource = readFileSync(join(import.meta.dir, "storage-tools.ts"), "utf8");
    const serverSource = readFileSync(join(import.meta.dir, "server.ts"), "utf8");

    expect(serverSource).toContain("registerTestersStorageTools");
    expect(toolsSource).toContain('"testers_storage_status"');
    expect(toolsSource).toContain('"testers_storage_push"');
    expect(toolsSource).toContain('"testers_storage_pull"');
    expect(toolsSource).toContain('"testers_storage_sync"');
  });
});
