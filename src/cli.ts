#!/usr/bin/env node
/**
 * `scorium`: the command-line front end for the Scorium configuration
 * language, TypeScript side. Mirrors `scorium-rs`'s `scorium-cli` crate's
 * subcommands and generic-runtime framing (no host functions or schema
 * attached -- an embedding application supplies those).
 *
 *   scorium check <file>        parse + evaluate; report diagnostics
 *   scorium parse <file>        print the parsed syntax tree
 *   scorium fmt <file>          format a file in place
 *   scorium fmt --check <file>  exit non-zero if a file isn't formatted
 *   scorium eval <file>         print the evaluated configuration tree
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { evaluate } from "./eval.ts";
import { ScoriumError } from "./errors.ts";
import { format } from "./format.ts";
import { parse } from "./parser.ts";
import { colorToHex8, durationToString, type Value } from "./value.ts";
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

function runCheck(path: string): number {
  const text = readSource(path);
  if (text === null) return 1;
  try {
    const doc = parse(text, { sourceName: path });
    const entries = evaluate(doc, { baseDir: dirname(path) });
    console.log(`${path}: ok (${entries.length} entries, generic runtime -- no schema or host functions attached)`);
    return 0;
  } catch (error) {
    reportError(error, path);
    return 1;
  }
}

function runParse(path: string): number {
  const text = readSource(path);
  if (text === null) return 1;
  try {
    const doc = parse(text, { sourceName: path });
    console.log(JSON.stringify(doc, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
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

function runEval(path: string): number {
  const text = readSource(path);
  if (text === null) return 1;
  try {
    const doc = parse(text, { sourceName: path });
    const entries = evaluate(doc, { baseDir: dirname(path) });
    printEntries(entries, 0);
    console.error(
      `(evaluated against the generic runtime: ${entries.length} entries; host ` +
        `functions and schema validation require an embedding application)`,
    );
    return 0;
  } catch (error) {
    reportError(error, path);
    return 1;
  }
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
    "  scorium check <file>        parse + evaluate; report diagnostics",
    "  scorium parse <file>        print the parsed syntax tree",
    "  scorium fmt <file>          format a file in place",
    "  scorium fmt --check <file>  exit non-zero if a file isn't formatted",
    "  scorium eval <file>         print the evaluated configuration tree",
  ].join("\n");
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return command ? 0 : 1;
  }
  if (command === "--version") {
    console.log(process.env.npm_package_version ?? "unknown");
    return 0;
  }

  const positionals = rest.filter((arg) => arg !== "--check");
  const check = rest.includes("--check");
  const path = positionals[0];
  if (!path) {
    console.error(`error: ${command} requires a <file> argument`);
    return 1;
  }

  switch (command) {
    case "check":
      return runCheck(path);
    case "parse":
      return runParse(path);
    case "fmt":
      return runFmt(path, check);
    case "eval":
      return runEval(path);
    default:
      console.error(`error: unknown command \`${command}\`\n`);
      console.error(usage());
      return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
