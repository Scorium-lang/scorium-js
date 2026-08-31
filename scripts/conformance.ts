#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "../src/parser.ts";
import { evaluate } from "../src/eval.ts";
import { format } from "../src/format.ts";
import { ScoriumError } from "../src/errors.ts";
import type { Entry } from "../src/entry.ts";
import { decodeEntries, entriesEqual } from "../src/fixture-codec.ts";
import {
  NodeSchema,
  Schema,
  listOf,
  type BuiltinValueType,
  type NodeSchemaBuilder,
  type SchemaBuilder,
  type ValueType,
} from "../src/schema.ts";

// Defaults to the vendored copy (fixtures/README.md) so this runs
// standalone from a fresh clone -- scorium-spec has no repo of its own
// to check out yet. Point SCORIUM_SPEC_FIXTURES at a live sibling
// checkout's conformance/<version>/ directory when iterating on
// scorium-spec itself.
const SPEC_ROOT = process.env.SCORIUM_SPEC_FIXTURES ?? join(import.meta.dirname, "..", "fixtures", "v0.2.1");
const CATEGORIES = ["values", "evaluation", "diagnostics", "sandbox", "schema"];

let pass = 0;
let fail = 0;

/** Runs a fixture's `source`, or its `files`+`entry` (written to a scratch dir so `include` has real files to read), returning the evaluated entries. */
function runFixture(fixture: any): Entry[] {
  const sandbox = fixture.options
    ? {
        ...(fixture.options.max_loop_iterations === undefined
          ? {}
          : { maxLoopIterations: fixture.options.max_loop_iterations }),
        ...(fixture.options.max_function_call_depth === undefined
          ? {}
          : { maxFunctionCallDepth: fixture.options.max_function_call_depth }),
      }
    : undefined;
  const includePolicy = fixture.options
    ? {
        ...(fixture.options.includes_enabled === undefined ? {} : { enabled: fixture.options.includes_enabled }),
        ...(fixture.options.allow_parent_traversal === undefined
          ? {}
          : { allowParentTraversal: fixture.options.allow_parent_traversal }),
      }
    : undefined;
  if (!fixture.files) {
    return evaluate(parse(fixture.source), { sandbox, includePolicy });
  }
  const dir = mkdtempSync(join(tmpdir(), "scorium-js-conformance-"));
  try {
    for (const [name, content] of Object.entries(fixture.files)) {
      writeFileSync(join(dir, name), content as string);
    }
    const entrySrc = readFileSync(join(dir, fixture.entry), "utf8");
    return evaluate(parse(entrySrc), { baseDir: dir, sandbox, includePolicy });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const category of CATEGORIES) {
  const dir = join(SPEC_ROOT, category);
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const fixture = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const label = `${category}/${file}`;

    if (skipForCapabilities(fixture, new Set())) {
      console.log(`SKIP  ${label}  ${fixture.name}`);
      continue;
    }

    if (category === "schema") {
      try {
        runSchemaFixture(fixture);
        pass++;
        console.log(`PASS  ${label}  ${fixture.name}`);
      } catch (err) {
        fail++;
        console.log(`FAIL  ${label}  ${fixture.name}`);
        console.log(`      ${(err as Error).message}`);
      }
      continue;
    }

    if (fixture.expect_error) {
      try {
        runFixture(fixture);
        fail++;
        console.log(`FAIL  ${label}  ${fixture.name}`);
        console.log(`      expected error ${fixture.expect_error.code}, but evaluation succeeded`);
      } catch (err) {
        const code = err instanceof ScoriumError ? err.code : undefined;
        if (code === fixture.expect_error.code) {
          pass++;
          console.log(`PASS  ${label}  ${fixture.name}`);
        } else {
          fail++;
          console.log(`FAIL  ${label}  ${fixture.name}`);
          console.log(`      expected error code ${fixture.expect_error.code}, got code ${code ?? "(non-ScoriumError)"}: ${(err as Error).message}`);
        }
      }
      continue;
    }

    try {
      const actual = runFixture(fixture);
      const expected = decodeEntries(fixture.expect);
      if (entriesEqual(actual, expected)) {
        pass++;
        console.log(`PASS  ${label}  ${fixture.name}`);
      } else {
        fail++;
        console.log(`FAIL  ${label}  ${fixture.name}`);
        console.log(`      expected: ${JSON.stringify(expected, bigintReplacer)}`);
        console.log(`      actual:   ${JSON.stringify(actual, bigintReplacer)}`);
      }
    } catch (err) {
      fail++;
      console.log(`FAIL  ${label}  ${fixture.name}`);
      console.log(`      threw: ${(err as Error).message}`);
    }
  }
}

{
  const dir = join(SPEC_ROOT, "formatter");
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const fixture = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const label = `formatter/${file}`;
    try {
      const actual = format(parse(fixture.input));
      if (actual === fixture.output) {
        pass++;
        console.log(`PASS  ${label}  ${fixture.name}`);
      } else {
        fail++;
        console.log(`FAIL  ${label}  ${fixture.name}`);
        console.log(`      expected: ${JSON.stringify(fixture.output)}`);
        console.log(`      actual:   ${JSON.stringify(actual)}`);
      }
    } catch (err) {
      fail++;
      console.log(`FAIL  ${label}  ${fixture.name}`);
      console.log(`      threw: ${(err as Error).message}`);
    }
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);

function skipForCapabilities(fixture: any, capabilities: Set<string>): boolean {
  return (fixture.requires ?? []).some((name: string) => !capabilities.has(name)) ||
    (fixture.excludes ?? []).some((name: string) => capabilities.has(name));
}

function runSchemaFixture(fixture: any): void {
  const doc = parse(fixture.source, { sourceName: "<fixture>" });
  const entries = evaluate(doc);
  const builder = Schema.builder().allowUnknownNodes(fixture.schema.allow_unknown_nodes ?? false);
  addKeys(builder, fixture.schema.root_keys ?? {});
  for (const name of Object.keys(fixture.schema.nodes ?? {}).sort()) {
    builder.node(name, buildNodeSchema(fixture.schema.nodes[name]));
  }
  const result = builder.build().validate(entries, { source: doc.source });
  if (fixture.expect_valid === true) {
    if (!result.isValid()) throw new Error(`expected valid schema result, got ${result.errors.map((error) => error.code).join(", ")}`);
    return;
  }
  const expected = fixture.expect_errors ?? [];
  if (result.errors.length !== expected.length) {
    throw new Error(`expected ${expected.length} schema errors, got ${result.errors.length}: ${result.errors.map((error) => error.code).join(", ")}`);
  }
  for (let index = 0; index < expected.length; index++) {
    const want = expected[index]!;
    const got = result.errors[index]!;
    if (got.code !== want.code || (want.node !== undefined && got.node !== want.node) ||
        (want.key !== undefined && got.key !== want.key) ||
        (want.suggestion !== undefined && got.suggestion !== want.suggestion)) {
      throw new Error(`schema error ${index} mismatch: expected ${JSON.stringify(want)}, got ${JSON.stringify({ code: got.code, node: got.node, key: got.key, suggestion: got.suggestion })}`);
    }
  }
}

function addKeys(builder: SchemaBuilder | NodeSchemaBuilder, keys: Record<string, any>): void {
  for (const name of Object.keys(keys).sort()) {
    const key = keys[name]!;
    if (key.required) builder.requiredKey(name, buildSchemaValueType(key.type));
    else builder.key(name, buildSchemaValueType(key.type));
  }
}

function buildNodeSchema(fixture: any): NodeSchema {
  const builder = NodeSchema.builder()
    .allowUnknownKeys(fixture.allow_unknown_keys ?? false)
    .duplicateKeyPolicy(fixture.duplicate_key_policy ?? "error");
  if (fixture.allowed_headers !== undefined) {
    const allowed = fixture.allowed_headers as Array<string | null>;
    builder.header((header) => allowed.includes(header) || "header is not allowed by the fixture");
  }
  addKeys(builder, fixture.keys ?? {});
  for (const name of Object.keys(fixture.nodes ?? {}).sort()) {
    builder.node(name, buildNodeSchema(fixture.nodes[name]));
  }
  return builder.build();
}

function buildSchemaValueType(value: string | { list: unknown }): ValueType {
  if (typeof value === "string") return value as BuiltinValueType;
  return listOf(buildSchemaValueType(value.list as string | { list: unknown }));
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
