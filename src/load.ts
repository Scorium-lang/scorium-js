import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Document } from "./ast.ts";
import type { Entry } from "./entry.ts";
import { evaluate, type EvalOptions } from "./eval.ts";
import { parse } from "./parser.ts";

export interface LoadedScorium {
  document: Document;
  entries: Entry[];
}

export interface LoadSourceOptions extends EvalOptions {
  sourceName?: string;
}

/** Read, parse, and evaluate a Scorium file with includes relative to that file. */
export function load(path: string, options: EvalOptions = {}): LoadedScorium {
  const source = readFileSync(path, "utf8");
  return loadSource(source, { ...options, sourceName: path, baseDir: options.baseDir ?? dirname(path) });
}

/** Parse and evaluate in-memory source while retaining its diagnostic name. */
export function loadSource(source: string, options: LoadSourceOptions = {}): LoadedScorium {
  const { sourceName = "<inline>", ...evalOptions } = options;
  const document = parse(source, { sourceName });
  const entries = evaluate(document, evalOptions);
  return { document, entries };
}
