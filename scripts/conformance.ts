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

const SPEC_ROOT = join(import.meta.dirname, "..", "..", "scorium-spec", "conformance", "v0.2.0-draft");
const CATEGORIES = ["values", "evaluation", "diagnostics", "sandbox"];

let pass = 0;
let fail = 0;

/** Runs a fixture's `source`, or its `files`+`entry` (written to a scratch dir so `include` has real files to read), returning the evaluated entries. */
function runFixture(fixture: any): Entry[] {
  if (!fixture.files) {
    return evaluate(parse(fixture.source));
  }
  const dir = mkdtempSync(join(tmpdir(), "scorium-js-conformance-"));
  try {
    for (const [name, content] of Object.entries(fixture.files)) {
      writeFileSync(join(dir, name), content as string);
    }
    const entrySrc = readFileSync(join(dir, fixture.entry), "utf8");
    return evaluate(parse(entrySrc), { baseDir: dir });
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

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
