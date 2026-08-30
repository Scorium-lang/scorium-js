# Embedding Scorium

`scorium` is the native TypeScript/JavaScript implementation for parsing,
evaluating, and formatting `.scor` configuration. It implements the same
versioned language contract as every conforming Scorium implementation and
provides an idiomatic API for JavaScript and TypeScript hosts.

## The pipeline

```text
source text
  -> parse -> typed AST
  -> evaluate -> ordered entries
  -> validate / inspect / apply (host decides)
```

Parsing and formatting do not access the filesystem. Evaluation accesses it
only when the document contains `include`, under the configured include
policy. Scorium does not mutate application state; only host functions can
perform host-defined effects.

## Install and runtime

```bash
npm install scorium
```

The published package requires Node.js 22 or newer and provides ESM plus
TypeScript declarations.

```ts
import {
  evaluate,
  format,
  parse,
  SCORIUM_LANGUAGE_VERSION,
  type Document,
  type Entry,
  type Value,
} from "scorium";
```

`SCORIUM_LANGUAGE_VERSION` reports the language revision independently of
the npm package version.

## 1. Parse

```ts
import { parse, type Document } from "scorium";

const source = `
server {
    port = 8080
    enabled = true
}
`;

const document: Document = parse(source);
```

The returned `Document` is the exported discriminated-union AST. Integer
literals use `bigint`, preserving Scorium's complete signed 64-bit range.

`parse` may throw `LexError` or `ParseError`:

```ts
import { LexError, ParseError, parse } from "scorium";

try {
  parse("port = 8*2");
} catch (error) {
  if (error instanceof LexError || error instanceof ParseError) {
    console.error(error.code, error.message);
  }
}
```

Diagnostic codes are stable API. Message text is intended for people and
may improve between releases.

## 2. Evaluate

```ts
import { evaluate, parse, type Entry } from "scorium";

const entries: Entry[] = evaluate(parse(`
server {
    port = 8080
    timeout = 5s
}
`));
```

`Entry` is an ordered tree:

```ts
type Entry =
  | { kind: "leaf"; key: string; value: Value }
  | { kind: "node"; name: string; header: string | null; children: Entry[] }
  | { kind: "include"; path: string };
```

Do not immediately convert entries to an object unless duplicate keys and
repeated nodes have a deliberate policy in your application.

### Values

```ts
type Value =
  | { kind: "int"; value: bigint }
  | { kind: "float"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "nil" }
  | { kind: "string"; value: string }
  | { kind: "color"; r: number; g: number; b: number; a: number }
  | { kind: "duration"; amount: number; unit: "ms" | "s" | "m" }
  | { kind: "list"; value: Value[] };
```

Keep the tag when moving values across JSON boundaries. JSON cannot encode a
`bigint` directly and cannot otherwise preserve the Int/Float distinction.

## 3. Register host capabilities

Values and functions are passed per evaluation:

```ts
import { evaluate, parse, type HostFunction, type Value } from "scorium";

const double: HostFunction = (args) => {
  const first = args[0];
  if (first?.kind === "int") {
    return { kind: "int", value: first.value * 2n };
  }
  throw new Error("double() expects an integer");
};

const hostValues: Record<string, Value> = {
  environment: { kind: "string", value: "production" },
};

const entries = evaluate(
  parse("workers = double(4)"),
  { hostFunctions: { double }, hostValues },
);
```

Scorium `fn` definitions take priority over same-named host functions.
Exceptions thrown by a host function are wrapped as
`scorium::eval::type_error`.

Every host function is a capability granted to the configuration. Prefer
pure functions, validate arguments, and do not expose process, network,
secret, or unrestricted filesystem access by accident.

## 4. Includes

Set `baseDir` to the directory containing the entry file:

```ts
const entries = evaluate(document, {
  baseDir: "/srv/example/config",
  includePolicy: {
    enabled: true,
    allowParentTraversal: false,
  },
});
```

The defaults enable includes but deny absolute paths, textual `..`
traversal, and symlink escapes outside `baseDir`. Included files resolve
their own includes relative to their own directory. Include cycles are
always detected.

Evaluation and includes currently use Node's synchronous filesystem APIs,
so evaluate on a worker or during configuration loading rather than in a
latency-sensitive request handler.

## 5. Resource limits

```ts
const entries = evaluate(document, {
  sandbox: {
    maxLoopIterations: 100_000,
    maxFunctionCallDepth: 64,
  },
});
```

Defaults are 1,000,000 total loop iterations and 256 nested Scorium
function calls per evaluation. A limit applies to the whole evaluation,
including included files and nested blocks.

There are no script instruction or Lua-memory options because this package
does not execute `script { }`.

## 6. Format

```ts
import { format, parse } from "scorium";

const canonical = format(parse(source));
const compact = format(parse(source), { indentWidth: 2 });
```

Formatting is deterministic and idempotent. Raw script bodies are preserved
byte-for-byte. See [LANGUAGE.md](./LANGUAGE.md#11-comments-and-formatting)
for the current comment-preservation boundary.

## Safe configuration updates

A host can implement transactional reloads with the staged API:

1. parse and evaluate the new source;
2. validate every entry against application requirements;
3. keep the old configuration if any step fails;
4. compare the old and new entry trees;
5. apply changes only after successful validation.

`scorium-js` does not currently ship a schema validator. Validation is a
host responsibility; the Rust project provides a separate schema crate.

## Public API at a glance

| Export | Purpose |
| --- | --- |
| `parse`, `LexError`, `ParseError` | Source to typed AST |
| `evaluate`, `EvalError` | AST to ordered entries |
| `format` | AST to canonical source |
| `SCORIUM_LANGUAGE_VERSION` | Implemented language revision |
| `Document`, `Item`, `Expr` and related types | AST inspection |
| `Entry`, `Value` | Evaluation output |
| `EvalOptions`, `IncludePolicy`, `SandboxOptions` | Host policy |
| `HostFunction` | Host call contract |
| `FormatOptions` | Formatter indentation |
