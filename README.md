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
- Identifier resolution steps 2 (`@`-variable) and 5 (fallback to a
  literal string) of `scorium-spec §1`'s 5-step order.
- The `squeezed_operator`, `at_in_expression`, and `dollar_in_expression`
  lex/parse diagnostics, and the `undefined_interpolation` and
  `arithmetic_overflow` eval diagnostics (by message content, not yet a
  structured error type — see below).

**Not yet implemented** (deferred, not silently unsupported — anything
outside this should be treated as "not yet built," not "not part of the
language"):

- Identifier resolution steps 1 (locals/params/loop vars) and 3 (sibling
  leaves) — no locals, no loops, so nothing to resolve yet; step 4 (host
  values) has no host registry yet either.
- Control flow (`if`/`elseif`/`else`, `for`, `while`), `local`, `fn`,
  member/method calls (`color.darken(...)`), and general function calls.
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
yet); multi-file (`include`) fixtures are skipped individually. Fixtures
needing control flow, functions, or method calls are expected to fail
until those land — that's accurate signal, not a bug to silence.

## Requirements

Node.js 22+. This repo runs TypeScript source files directly (no build
step in development) — Node's native TypeScript support strips types at
runtime. `npm run typecheck` runs `tsc --noEmit` for real type-checking.
