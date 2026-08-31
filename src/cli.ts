#!/usr/bin/env node
/**
 * `scorium`: the command-line front end for the Scorium configuration
 * language, TypeScript side. Mirrors `scorium-rs`'s `scorium-cli` crate's
 * subcommands and generic-runtime framing (no host functions or schema
 * attached -- an embedding application supplies those).
 *
 *   scorium check <file>          parse + evaluate; report diagnostics
 *   scorium parse <file>          print the parsed syntax tree
 *   scorium fmt <file>            format a file in place
 *   scorium fmt --check <file>    exit non-zero if a file isn't formatted,
 *                                  printing a line diff of what would change
 *   scorium eval <file>           print the evaluated configuration tree
 *   scorium eval <file> --json    print it as tagged-value JSON instead,
 *                                  using the same encoding as scorium-spec's
 *                                  conformance fixtures (conformance/README.md)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { evaluate } from "./eval.ts";
import { ScoriumError } from "./errors.ts";
import { format } from "./format.ts";
import { parse } from "./parser.ts";
import { portableAst } from "./portable.ts";
import { colorToHex8, durationToString, type Value } from "./value.ts";
import { SCORIUM_LANGUAGE_VERSION } from "./version.ts";
import type { Entry } from "./entry.ts";

function readSource(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: cannot read ${path}: ${message}`);
    return null;
  }
}

function reportError(error: unknown, path: string): void {
  if (error instanceof ScoriumError) {
    console.error(error.format());
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${path}: ${message}`);
}

interface CheckPosition {
  line: number;
  character: number;
}

interface CheckDiagnostic {
  code: string;
  stage: string;
  severity: "error" | "warning";
  message: string;
  source: string;
  range: { start: CheckPosition; end: CheckPosition };
  related: unknown[];
}

function checkResult(path: string, ok: boolean, diagnostics: CheckDiagnostic[], entries?: number): void {
  const result: Record<string, unknown> = {
    ok,
    language_version: SCORIUM_LANGUAGE_VERSION,
    source: path,
    diagnostics,
  };
  if (entries !== undefined) result.entries = entries;
  console.log(JSON.stringify(result, null, 2));
}

function utf16Position(text: string, offset: number): CheckPosition {
  const prefix = text.slice(0, Math.max(0, Math.min(offset, text.length))).replaceAll("\r\n", "\n");
  const line = (prefix.match(/\n/g) ?? []).length;
  const lineStart = prefix.lastIndexOf("\n") + 1;
  return { line, character: prefix.length - lineStart };
}

function diagnosticStage(code: string): string {
  return code.split("::")[1] ?? "cli";
}

function errorDiagnostic(error: unknown, text: string, path: string): CheckDiagnostic {
  if (error instanceof ScoriumError) {
    const start = error.span?.start ?? 0;
    const end = error.span?.end ?? start;
    const message = error.code ? error.message.replace(new RegExp(`^${error.code}:\\s*`), "") : error.message;
    return {
      code: error.code || "scorium::cli::runtime",
      stage: diagnosticStage(error.code),
      severity: "error",
      message,
      source: error.sourceName ?? path,
      range: error.location && error.endLocation
        ? {
            start: { line: error.location.line - 1, character: error.location.column - 1 },
            end: { line: error.endLocation.line - 1, character: error.endLocation.column - 1 },
          }
        : { start: utf16Position(text, start), end: utf16Position(text, end) },
      related: [],
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "scorium::cli::runtime",
    stage: "cli",
    severity: "error",
    message,
    source: path,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    related: [],
  };
}

function runCheck(path: string, json: boolean): number {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      checkResult(path, false, [{
        code: "scorium::cli::io",
        stage: "cli",
        severity: "error",
        message,
        source: path,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        related: [],
      }]);
    } else {
      console.error(`error: cannot read ${path}: ${message}`);
    }
    return 1;
  }
  try {
    const doc = parse(text, { sourceName: path });
    const entries = evaluate(doc, { baseDir: dirname(path) });
    if (json) {
      checkResult(path, true, [], entries.length);
      return 0;
    }
    console.log(`${path}: ok (${entries.length} entries, generic runtime -- no schema or host functions attached)`);
    return 0;
  } catch (error) {
    if (json) checkResult(path, false, [errorDiagnostic(error, text, path)]);
    else reportError(error, path);
    return 1;
  }
}

function runParse(path: string, json: boolean): number {
  const text = readSource(path);
  if (text === null) return 1;
  try {
    const doc = parse(text, { sourceName: path });
    const output = json ? portableAst(doc) : doc;
    console.log(JSON.stringify(output, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
    return 0;
  } catch (error) {
    reportError(error, path);
    return 1;
  }
}

function runFmt(path: string, check: boolean): number {
  const text = readSource(path);
  if (text === null) return 1;
  let formatted: string;
  try {
    const doc = parse(text, { sourceName: path });
    formatted = format(doc);
  } catch (error) {
    reportError(error, path);
    return 1;
  }
  if (check) {
    if (formatted === text) return 0;
    console.error(`${path}: not formatted (run \`scorium fmt ${path}\` to fix)`);
    printFormatDiff(text, formatted);
    return 1;
  }
  try {
    writeFileSync(path, formatted, "utf8");
    console.log(`${path}: formatted`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: cannot write ${path}: ${message}`);
    return 1;
  }
}

function runEval(path: string, json: boolean): number {
  const text = readSource(path);
  if (text === null) return 1;
  try {
    const doc = parse(text, { sourceName: path });
    const entries = evaluate(doc, { baseDir: dirname(path) });
    if (json) {
      console.log(JSON.stringify({ type: "entries", value: entries.map(entryToJson) }, null, 2));
    } else {
      printEntries(entries, 0);
      console.error(
        `(evaluated against the generic runtime: ${entries.length} entries; host ` +
          `functions and schema validation require an embedding application)`,
      );
    }
    return 0;
  } catch (error) {
    reportError(error, path);
    return 1;
  }
}

/**
 * Encodes an evaluated entry using the same tagged-value JSON scheme
 * `scorium-spec`'s conformance fixtures use (`conformance/README.md`),
 * matching `scorium-cli`'s `eval --json` byte-for-byte in shape (modulo
 * JSON key order) so output is directly comparable across implementations.
 */
function entryToJson(entry: Entry): unknown {
  switch (entry.kind) {
    case "leaf":
      return { kind: "leaf", key: entry.key, value: valueToJson(entry.value) };
    case "node":
      return { kind: "node", name: entry.name, header: entry.header, children: entry.children.map(entryToJson) };
    case "include":
      return { kind: "include", path: entry.path };
    case "hostCall":
      return { kind: "hostCall", name: entry.name, args: entry.args.map(valueToJson), result: valueToJson(entry.result) };
  }
}

function valueToJson(value: Value): unknown {
  switch (value.kind) {
    case "int":
      return { type: "int", value: value.value.toString() };
    case "float":
      return { type: "float", value: formatFloat(value.value) };
    case "bool":
      return { type: "bool", value: value.value };
    case "nil":
      return { type: "nil" };
    case "string":
      return { type: "string", value: value.value };
    case "color":
      return { type: "color", value: colorToHex8(value) };
    case "duration":
      return { type: "duration", value: durationToString(value) };
    case "list":
      return { type: "list", value: value.value.map(valueToJson) };
  }
}

/** Matches the fixed tokens `conformance/README.md`'s tagged-value encoding requires for non-finite floats. */
function formatFloat(f: number): string {
  if (Number.isNaN(f)) return "nan";
  if (f === Infinity) return "inf";
  if (f === -Infinity) return "-inf";
  return String(f);
}

/**
 * A minimal LCS-based line diff, formatted like a compact unified diff.
 * Good enough for a config file's typical formatter changes (spacing,
 * comment normalization) without pulling in a diff dependency for one
 * CLI flag. Mirrors `scorium-cli`'s `print_format_diff`.
 */
function printFormatDiff(original: string, formatted: string): void {
  const a = original.split("\n");
  const b = formatted.split("\n");
  const [n, m] = [a.length, b.length];
  if (n * m > 4_000_000) {
    console.error("(diff omitted: file too large)");
    return;
  }
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  let [i, j] = [0, 0];
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      console.log(`- ${a[i]}`);
      i++;
    } else {
      console.log(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) console.log(`- ${a[i++]}`);
  while (j < m) console.log(`+ ${b[j++]}`);
}

/** Mirrors `scorium-cli`'s `print_entries`: an indented outline, not the raw AST/entry Debug shape. */
function printEntries(entries: readonly Entry[], depth: number): void {
  const indent = "  ".repeat(depth);
  for (const entry of entries) {
    if (entry.kind === "leaf") {
      console.log(`${indent}${entry.key} = ${formatValue(entry.value)}`);
    } else if (entry.kind === "node") {
      console.log(entry.header !== null ? `${indent}${entry.name} ${entry.header} {` : `${indent}${entry.name} {`);
      printEntries(entry.children, depth + 1);
      console.log(`${indent}}`);
    } else if (entry.kind === "hostCall") {
      console.log(`${indent}${entry.name}(${entry.args.map(formatValue).join(", ")})`);
    } else {
      console.log(`${indent}include "${entry.path}"`);
    }
  }
}

function formatValue(value: Value): string {
  switch (value.kind) {
    case "int":
      return value.value.toString();
    case "float":
      return String(value.value);
    case "bool":
      return String(value.value);
    case "nil":
      return "nil";
    case "string":
      return JSON.stringify(value.value);
    case "color":
      return colorToHex8(value);
    case "duration":
      return durationToString(value);
    case "list":
      return `[${value.value.map(formatValue).join(", ")}]`;
  }
}

function usage(): string {
  return [
    "scorium: check, format, parse, and evaluate .scor configuration files",
    "",
    "Usage:",
    "  scorium check <file>          parse + evaluate; report diagnostics",
    "  scorium check <file> --json   report a stable machine-readable result",
    "  scorium parse <file>          print the parsed syntax tree",
    "  scorium parse <file> --json   print the portable syntax tree contract",
    "  scorium fmt <file>            format a file in place",
    "  scorium fmt --check <file>    exit non-zero if a file isn't formatted",
    "  scorium eval <file>           print the evaluated configuration tree",
    "  scorium eval <file> --json    print it as tagged-value JSON instead",
  ].join("\n");
}

/**
 * Reads this package's own version from package.json, one directory up
 * from this file whether running from src/ (dev, no build) or dist/
 * (published) -- `process.env.npm_package_version` only exists inside an
 * `npm run` script context, not for a directly invoked/npx'd binary, so
 * it can't be used here.
 */
function packageVersion(): string {
  try {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return command ? 0 : 2;
  }
  if (command === "--version") {
    console.log(packageVersion());
    return 0;
  }

  const positionals = rest.filter((arg) => arg !== "--check" && arg !== "--json");
  const check = rest.includes("--check");
  const json = rest.includes("--json");
  const path = positionals[0]!;
  if (
    positionals.length !== 1 ||
    (check && command !== "fmt") ||
    (json && command !== "check" && command !== "parse" && command !== "eval")
  ) {
    console.error(`error: invalid usage for ${command}; expected exactly one <file> and only supported options`);
    return 2;
  }

  switch (command) {
    case "check":
      return runCheck(path, json);
    case "parse":
      return runParse(path, json);
    case "fmt":
      return runFmt(path, check);
    case "eval":
      return runEval(path, json);
    default:
      console.error(`error: unknown command \`${command}\`\n`);
      console.error(usage());
      return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
