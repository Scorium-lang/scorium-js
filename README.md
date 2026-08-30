# scorium (scorium-js)

**Status: early draft. Declarative literal subset only — see "Current
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
- Identifier resolution steps 1 (local/param/loop-var), 2 (`@`-variable),
  3 (sibling leaf — a leaf emitted earlier in the *same* body), and 5
  (fallback to a literal string) of `scorium-spec §1`'s 5-step order.
- Control flow (`if`/`elseif`/`else`, numeric `for` with optional step,
  `while`), `local` and the leaf-reassignment rule (`n = n + 1` updates
  an existing `local`, but — confirmed against a real `scorium-rust`
  test — does *not* apply to a `fn` parameter of the same name; that
  case still emits a leaf), `fn` definitions, and calls (statement- and
  expression-position, plain-identifier or member callees).
- Member/method calls (`primary.darken(1.0)`) — the color methods
  (`darken`/`lighten`/`alpha`), the only value type with methods.
- The `squeezed_operator`, `at_in_expression`, and `dollar_in_expression`
  lex/parse diagnostics, and the `undefined_interpolation`,
  `arithmetic_overflow`, and `unknown_function` eval diagnostics (by
  message content, not yet a structured error type — see below).

**21/21 runnable `scorium-spec` conformance fixtures pass** (see
"Conformance" below) — the entire non-Lua language core except
`include` is implemented.

**Not yet implemented** (deferred, not silently unsupported — anything
outside this should be treated as "not yet built," not "not part of the
language"):

- Identifier resolution step 4 (host values) — no host registry yet.
- `include`.
- `script {}` / Lua (the Full-conformance-level question from
  `scorium-spec §7`, itself still unapproved — not started either way).
- The canonical formatter (`scorium-spec §4`).
- The rest of the diagnostic code catalog (`scorium-spec §5`) — errors
  thrown today are plain `Error`s with the `scorium::*` code embedded in
  the message text, not yet a structured, catchable error type per code.
- Sandbox resource limits (`scorium-spec §6`).

## Conformance

`npm run conformance` runs `scripts/conformance.ts` against
`../scorium-spec/conformance/v0.2.0-draft/{values,evaluation,diagnostics}/`
(relative sibling checkout — only works when `scorium-spec` is checked
out alongside this repo, e.g. both under `scorium-lang/`). `formatter/`
and `sandbox/` are skipped entirely (no formatter, no resource limits
yet); multi-file (`include`) fixtures are skipped individually (2 —
both need `include`, the only remaining gap). 21/21 of everything else
passes.

## Requirements

Node.js 22+. This repo runs TypeScript source files directly (no build
step in development) — Node's native TypeScript support strips types at
runtime. `npm run typecheck` runs `tsc --noEmit` for real type-checking.
