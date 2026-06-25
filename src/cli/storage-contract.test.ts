import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("testers storage CLI contract", () => {
  it("shows storage command in help", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "src/cli/index.tsx", "--help"],
      cwd: join(import.meta.dir, "../.."),
      env: {
        ...process.env,
        TESTERS_DB_PATH: ":memory:",
        HASNA_TESTERS_DB_PATH: ":memory:",
        NO_COLOR: "1",
      },
    });

    const stdout = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("events");
    expect(stdout).toContain("storage");
    expect(stdout).toContain("webhooks");
  });

  it("registers only the storage command", () => {
    const source = readFileSync(join(import.meta.dir, "storage.ts"), "utf8");

    expect(source).toContain("registerStorageCommands");
    expect(source).toContain('program.command("storage")');
    expect(source).not.toContain("hidden: true");
  });
});
