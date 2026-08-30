# scorium (scorium-js)

**Status: the full non-Lua language core is implemented, including
sandbox resource limits and structured diagnostics — see "Current
scope" below. Not published to npm.**

A native TypeScript/JavaScript implementation of the [Scorium][spec]
configuration language. Pure TypeScript, zero Rust: no Rust library, no
Rust toolchain, no C-ABI wrapper, no Rust-generated WebAssembly, no Rust
sidecar process. This is a native implementation, not a binding around
`scorium-rust`.

[spec]: ../scorium-spec

## Language version

Pins and reports `SCORIUM_LANGUAGE_VERSION` (see `src/version.ts`) —
currently `0.2.0-draft`, matching `scorium-spec`'s current draft. This
package's own `package.json` version is independent of the language
version it implements (see `scorium-spec/README.md` on why implementations
release independently).

## Current scope

This is a staged build, following the same order `scorium-spec` itself
was drafted in (grammar → values → evaluation → formatter → diagnostics →
sandbox). **Implemented so far:**

- The declarative surface: nodes (with optional headers), leaves, and
  all eight value types (`Int`, `Float`, `Bool`, `Nil`, `Str`, `Color`,
  `Duration`, `List`), with `Int` backed by `bigint` to satisfy
  `scorium-spec §2`'s exact-representation requirement.
- `@`-variables and `$`-interpolation in bare strings, including the
  undefined-interpolation error (no fallback for `$name`, unlike a plain
  identifier).
- Full expressions: arithmetic (`+ - * / %`, checked `Int` overflow,
  `Int`/`Int` division always `Float`, `%` as pure Euclidean remainder),
  comparison (`== ~= < > <= >=`, with exact `Int`/`Float` ordering that
  never casts the integer through `f64` first), logic (`and`/`or`
  short-circuiting, `not`), unary negation, and grouping parens.
- **All five steps** of `scorium-spec §1`'s identifier resolution: 1
  (local/param/loop-var), 2 (`@`-variable), 3 (sibling leaf — a leaf
  emitted earlier in the *same* body), 4 (host value, via
  `evaluate(doc, { hostValues })`), and 5 (fallback to a literal string).
- A host function/value registry (`evaluate(doc, { hostFunctions,
  hostValues })`) — "one registry, multiple surfaces" (scorium-spec §6):
  a host function is callable exactly like a Scorium `fn` (`f(a, b)`), a
  host value resolves as a plain identifier. A Scorium `fn` of the same
  name takes priority over a host function, matching `scorium-rust`'s own
  precedence. A throw inside a host function is wrapped as
  `scorium::eval::type_error`, matching `scorium-rust`'s
  `Result<Value, String>` host-function contract.
- Control flow (`if`/`elseif`/`else`, numeric `for` with optional step,
  `while`), `local` and the leaf-reassignment rule (`n = n + 1` updates
  an existing `local`, but — confirmed against a real `scorium-rust`
  test — does *not* apply to a `fn` parameter of the same name; that
  case still emits a leaf), `fn` definitions, and calls (statement- and
  expression-position, plain-identifier or member callees).
- Member/method calls (`primary.darken(1.0)`) — the color methods
  (`darken`/`lighten`/`alpha`), the only value type with methods.
- `include`, with path containment enforced on the canonicalized
  (symlink-resolved) path per `scorium-spec §6` — not just a textual
  `..`/absolute-path check — and cycle detection.
- The canonical formatter (`scorium-spec §4`): comment preservation
  (leading + same-line trailing, item granularity; `--` normalizes to
  `#`), blank-line capping to one, precedence-driven re-parenthesization,
  and the `Int`/`Float`/duration literal-formatting rules. Verified
  byte-for-byte against real `scorium-rust` canonical output for
  constructs the JSON fixtures don't directly cover (`for`, `if`/`else`,
  `fn`, `include`).
- `script { ... }` is parsed and formatted correctly (raw-captured
  verbatim, never reformatted) but **not executable** — evaluating one
  raises a clear, explicit error rather than silently no-op'ing or (the
  bug this caught during development) accidentally misparsing the body
  as ordinary Scorium items. See "Not yet implemented" below.
- Sandbox resource limits (`scorium-spec §3`/`§6`): a total loop-iteration
  budget shared across the *whole* evaluation (not per-loop) and a
  function call-depth limit, both configurable via `evaluate(doc, {
  sandbox: { maxLoopIterations, maxFunctionCallDepth } })`, defaulting to
  `scorium-rust`'s own values (1,000,000 / 256). Script instruction/memory
  limits aren't included — they're Lua-specific and no Lua VM is embedded.
- Structured diagnostics: every thrown error is a `ScoriumError` (via
  `LexError`/`ParseError`/`EvalError`) exposing a real `.code` field —
  `scorium::eval::loop_budget_exceeded`, `scorium::eval::type_error`, etc.
  — extracted from the message text every throw site already used, so
  callers can branch on `.code` reliably instead of pattern-matching
  message strings.
- The `squeezed_operator`, `at_in_expression`, and `dollar_in_expression`
  lex/parse diagnostics, and the `undefined_interpolation`,
  `arithmetic_overflow`, `unknown_function`, `includes_disabled`,
  `include_path_denied`, `include_cycle`, `include_io`, `include_parse`,
  `script_error`, `loop_budget_exceeded`, and `call_depth_exceeded` eval
  diagnostics.

**31/31 `scorium-spec` conformance fixtures pass — the entire corpus,
including `sandbox/`** (see "Conformance" below). The full non-Lua
language core, including all five identifier-resolution steps and host
integration, is implemented.

**Not yet implemented** (deferred, not silently unsupported — anything
outside this should be treated as "not yet built," not "not part of the
language"):

- `script {}` *execution* — no Lua VM embedded (the Full-conformance-level
  question from `scorium-spec §7`, itself still unapproved). Parsing and
  formatting a document containing one already works (see above). This is
  the only remaining gap in the language core.
- The rest of the diagnostic code catalog (`scorium-spec §5`) beyond the
  codes listed above.
- No host-integration conformance fixtures exist yet in `scorium-spec`
  (a deliberately separate, undesigned corpus per its own
  `conformance/README.md`) — the host registry above is verified against
  `scorium-rust`'s own equivalent tests (`select()`, `environment`), not
  against a fixture.

## Conformance

`npm run conformance` runs `scripts/conformance.ts` against
`../scorium-spec/conformance/v0.2.0-draft/{values,evaluation,diagnostics,sandbox,formatter}/`
(relative sibling checkout — only works when `scorium-spec` is checked
out alongside this repo, e.g. both under `scorium-lang/`), including
multi-file `include` fixtures (written to a scratch temp directory per
fixture) and `sandbox/`'s resource-limit fixtures, now safe to run since
the limits they exercise actually exist. **31/31 passes**, runs in well
under a second.

## Requirements

Node.js 22+. This repo runs TypeScript source files directly (no build
step in development) — Node's native TypeScript support strips types at
runtime. `npm run typecheck` runs `tsc --noEmit` for real type-checking.
