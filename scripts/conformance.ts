#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/parser.ts";
import { evaluate } from "../src/eval.ts";
import { decodeEntries, entriesEqual } from "../src/fixture-codec.ts";

// Multi-file (`files`+`entry`) fixtures need `include`, not implemented
// yet, so they're skipped here rather than attempted. formatter/ and
// sandbox/ are separate concerns (no formatter, no resource limits yet).
const SPEC_ROOT = join(import.meta.dirname, "..", "..", "scorium-spec", "conformance", "v0.2.0-draft");
const CATEGORIES = ["values", "evaluation", "diagnostics"];

let pass = 0;
let fail = 0;
let skip = 0;

for (const category of CATEGORIES) {
  const dir = join(SPEC_ROOT, category);
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const fixture = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const label = `${category}/${file}`;

    if (fixture.files) {
      skip++;
      console.log(`SKIP  ${label}  ${fixture.name}  (multi-file / include, not implemented yet)`);
      continue;
    }

    if (fixture.expect_error) {
      try {
        evaluate(parse(fixture.source));
        fail++;
        console.log(`FAIL  ${label}  ${fixture.name}`);
        console.log(`      expected error ${fixture.expect_error.code}, but evaluation succeeded`);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes(fixture.expect_error.code)) {
          pass++;
          console.log(`PASS  ${label}  ${fixture.name}`);
        } else {
          fail++;
          console.log(`FAIL  ${label}  ${fixture.name}`);
          console.log(`      expected error code ${fixture.expect_error.code}, got: ${msg}`);
        }
      }
      continue;
    }

    try {
      const actual = evaluate(parse(fixture.source));
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

console.log(`\n${pass}/${pass + fail} passed (${skip} skipped: multi-file/include)`);
process.exit(fail === 0 ? 0 : 1);

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
