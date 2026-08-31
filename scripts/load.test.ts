import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { load, loadSource } from "../src/load.ts";

test("load reads, parses, evaluates, and resolves includes relative to the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-load-"));
  writeFileSync(join(dir, "child.scor"), "child = 2\n");
  writeFileSync(join(dir, "main.scor"), 'root = 1\ninclude "child.scor"\n');
  try {
    const loaded = load(join(dir, "main.scor"));
    assert.equal(loaded.document.source?.name, join(dir, "main.scor"));
    assert.deepEqual(loaded.entries.filter((entry) => entry.kind === "leaf").map((entry) => entry.key), ["root", "child"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadSource keeps an explicit source name for diagnostics", () => {
  assert.throws(() => loadSource("bad = 1s + 1s\n", { sourceName: "settings.scor" }), /type_error/);
});
