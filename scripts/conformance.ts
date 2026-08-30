#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/parser.ts";
import { evaluate } from "../src/eval.ts";
import { decodeEntries, entriesEqual } from "../src/fixture-codec.ts";

// Only `values/` is in scope: every other category exercises language
// features this build doesn't implement yet (see README.md).
const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "scorium-spec", "conformance", "v0.2.0-draft", "values");

let pass = 0;
let fail = 0;

for (const file of readdirSync(FIXTURE_DIR).sort()) {
  if (!file.endsWith(".json")) continue;
  const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8"));
  try {
    const doc = parse(fixture.source);
    const actual = evaluate(doc);
    const expected = decodeEntries(fixture.expect);
    if (entriesEqual(actual, expected)) {
      pass++;
      console.log(`PASS  values/${file}  ${fixture.name}`);
    } else {
      fail++;
      console.log(`FAIL  values/${file}  ${fixture.name}`);
      console.log(`      expected: ${JSON.stringify(expected, bigintReplacer)}`);
      console.log(`      actual:   ${JSON.stringify(actual, bigintReplacer)}`);
    }
  } catch (err) {
    fail++;
    console.log(`FAIL  values/${file}  ${fixture.name}`);
    console.log(`      threw: ${(err as Error).message}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
