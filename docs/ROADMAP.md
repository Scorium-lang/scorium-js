# Roadmap

The cross-language roadmap lives in `scorium-spec/ROADMAP.md`. This document
records the JavaScript/TypeScript implementation's role while keeping its API
natural for the ecosystem.

## Status

`scorium-js` implements the non-Lua behavior of language version `0.2.1` and
passes every applicable fixture: 55 pass and the one Lua-required fixture is
capability-skipped. `script {}` is parsed and formatted but intentionally
raises `scorium::eval::script_error` if evaluation reaches it.

## Delivered roadmap 1-6

1. The expanded fixture runner covers diagnostics, includes, schema, and
   explicit capability requirements.
2. Parser and schema behavior matches Rust and Go, including reserved words,
   header validation, and deterministic required-key errors.
3. `scorium check --json` and `scorium parse --json` implement tooling contract
   v1 with UTF-16 ranges and the shared portable syntax tree.
4. `load(path)` and `loadSource(source, options)` provide the common read,
   parse, evaluate, and file-relative include path.
5. Editor support comes from the shared `scorium-lsp` executable; duplicating
   it in Node would add drift without changing `.scor` behavior.
6. AquaTTY validates that the non-Lua language core is useful in a real host,
   so adding a JavaScript Lua VM remains unjustified.

## Next evidence gates

- Add a host-provided or asynchronous include resolver when a browser or
  virtual-filesystem consumer demonstrates the need.
- Split a browser-only parser/formatter entry point if Node filesystem imports
  materially block adoption.
- Add schema-aware editor diagnostics through the shared LSP once host schemas
  have a portable discovery contract.

New syntax, generic iteration, nested comments, additional escapes, and Lua
execution remain deferred until a real workflow requires them and the spec has
matching cross-port fixtures.

## Non-goals

Scorium is not a JavaScript or Lua replacement, a JSON interchange format, or
an API that silently ignores unsupported constructs.
