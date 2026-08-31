import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CLI = join(import.meta.dirname, "..", "src", "cli.ts");

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status ?? 1, stdout: e.stdout, stderr: e.stderr };
  }
}

test("`scorium check` reports a well-formed document as ok", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "demo.scor");
  writeFileSync(file, 'name = "demo"\n');
  try {
    const result = run(["check", file]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ok \(1 entries/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium check` reports a diagnostic and exits non-zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "bad.scor");
  writeFileSync(file, "bad = 1s + 1s\n");
  try {
    const result = run(["check", file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /scorium::eval::type_error/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium check --json` reports the shared machine contract with UTF-16 ranges", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const valid = join(dir, "valid.scor");
  const invalid = join(dir, "invalid.scor");
  writeFileSync(valid, "port = 8080\n");
  writeFileSync(invalid, 'bad = "😀" ?\n');
  try {
    const success = run(["check", valid, "--json"]);
    assert.equal(success.status, 0);
    assert.deepEqual(JSON.parse(success.stdout), {
      ok: true,
      language_version: "0.2.1",
      source: valid,
      diagnostics: [],
      entries: 1,
    });

    const failure = run(["check", invalid, "--json"]);
    assert.equal(failure.status, 1);
    assert.equal(failure.stderr, "");
    const result = JSON.parse(failure.stdout) as {
      ok: boolean;
      diagnostics: Array<{ code: string; stage: string; range: { start: { line: number; character: number } } }>;
    };
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "scorium::lex::unexpected_char");
    assert.equal(result.diagnostics[0]?.stage, "lex");
    assert.deepEqual(result.diagnostics[0]?.range.start, { line: 0, character: 11 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium fmt --check` fails on unformatted input, `scorium fmt` fixes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "unformatted.scor");
  writeFileSync(file, "name=1\n");
  try {
    const checkResult = run(["fmt", "--check", file]);
    assert.equal(checkResult.status, 1);

    const fmtResult = run(["fmt", file]);
    assert.equal(fmtResult.status, 0);
    assert.equal(readFileSync(file, "utf8"), "name = 1\n");

    const recheck = run(["fmt", "--check", file]);
    assert.equal(recheck.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium eval` prints the evaluated tree as an indented outline", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "eval.scor");
  writeFileSync(file, 'server {\n    port = 8080\n}\n');
  try {
    const result = run(["eval", file]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /server \{\n {2}port = 8080\n\}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium eval --json` prints tagged-value JSON matching the conformance encoding", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "eval.scor");
  writeFileSync(file, "port = 8080\n");
  try {
    const result = run(["eval", file, "--json"]);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      type: "entries",
      value: [{ kind: "leaf", key: "port", value: { type: "int", value: "8080" } }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium parse --json` prints the portable syntax tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "parse.scor");
  writeFileSync(file, 'server "primary" {\n port = 8000 + 80\n}\n');
  try {
    const result = run(["parse", file, "--json"]);
    assert.equal(result.status, 0);
    const tree = JSON.parse(result.stdout) as { type: string; language_version: string; items: unknown[] };
    assert.equal(tree.type, "document");
    assert.equal(tree.language_version, "0.2.1");
    assert.equal(tree.items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("`scorium fmt --check` prints a line diff of what would change", () => {
  const dir = mkdtempSync(join(tmpdir(), "scorium-cli-"));
  const file = join(dir, "unformatted.scor");
  writeFileSync(file, "name=1\n");
  try {
    const result = run(["fmt", "--check", file]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^- name=1$/m);
    assert.match(result.stdout, /^\+ name = 1$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unknown command exits non-zero with usage on stderr", () => {
  const result = run(["frobnicate", "x.scor"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command/);
});

test("no arguments prints usage and exits non-zero", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Usage:/);
});

test("unsupported options are usage errors", () => {
  const result = run(["check", "config.scor", "--wat"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid usage/);
});

test("`scorium --version` reports the real package version, not \"unknown\"", () => {
  // Regression: this used to read process.env.npm_package_version, which
  // only exists inside an `npm run` script context -- run() here spawns
  // the CLI directly, the same way `npx scorium` does, and caught this
  // reporting "unknown" for real once published.
  const result = run(["--version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});
