# Roadmap

This document separates what `scorium-js` implements from deferred work so
planned features are not mistaken for shipped behavior.

## Status

The native non-Lua language core, canonical formatter, include policy,
resource limits, and TypeScript embedding API are implemented. The package
passes all 34 vendored conformance fixtures for stable language version
`0.2.0`. It is pre-1.0, so its public TypeScript API may change between
minor versions.

## Implemented

### Language

- nodes, optional headers, leaves, and nested nodes;
- integers, floats, booleans, nil, strings, lists, colors, and durations;
- `@` definitions, `$` interpolation, locals, sibling values, and host values;
- arithmetic, comparisons, booleans, calls, and color methods;
- `if`/`elseif`/`else`, numeric `for`, `while`, `return`, and `fn`;
- includes with path containment and cycle detection;
- all three comment forms;
- parsing and byte-preserving formatting of raw `script { }` bodies.

### Tooling and integration

- native TypeScript parser, evaluator, and formatter;
- exported AST, entry, value, option, and error types;
- catchable `scorium::*` diagnostic codes;
- host value and function registration;
- configurable loop, call-depth, and include policies;
- canonical, idempotent formatting;
- versioned cross-implementation conformance fixtures in CI;
- ESM npm package with declarations and no runtime dependencies.

## Deferred

These are directions, not release promises.

### Language-family decisions

- **`script { }` execution.** No Lua VM is embedded. Stable Scorium `0.2.0`
  makes this an optional capability. Adding it here requires a suitable Lua
  runtime and a sandbox/security review. Before then, the raw-script scanner
  also needs to account for braces inside Lua strings and comments.
- **Host-pluggable literal syntax.** Hosts can supply values and functions,
  but cannot register new lexer token shapes.
- **Generic iteration.** Only numeric `for` is specified.
- **Additional escapes and nested comments.** These require a later language
  version and matching conformance fixtures.

### JS/TypeScript integration

- a schema-validation package or host-schema API;
- structured source spans and line/column metadata on public errors;
- async include loading or a host-provided file resolver;
- browser-compatible parsing and formatting entry points that do not import
  Node filesystem modules through the evaluator bundle;
- richer generated API reference from exported declarations.

### Tooling

- a Scorium CLI distributed through npm;
- an LSP for diagnostics, completion, hover, and navigation;
- editor syntax packages;
- source maps between formatted output and the original source.

## Non-goals

Scorium is not intended to be:

- a general-purpose JavaScript or Lua replacement;
- a machine-interchange replacement for JSON;
- a format tied to one application or operating system;
- an API that silently ignores unsupported language constructs.
