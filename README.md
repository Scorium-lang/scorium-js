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
sandbox). **Implemented so far:** lexing, parsing, and evaluating the
*declarative* surface only — nodes (with optional headers), leaves, and
all eight value types (`Int`, `Float`, `Bool`, `Nil`, `Str`, `Color`,
`Duration`, `List`), with `Int` backed by `bigint` to satisfy
`scorium-spec §2`'s exact-representation requirement (a `number` cannot
carry the full 64-bit signed range exactly).

**Not yet implemented** (deferred, not silently unsupported — anything
outside the literal subset should be treated as "not yet built," not "not
part of the language"):

- `@`-variables, `$`-interpolation, sibling-leaf resolution, host values —
  bare identifiers currently only ever hit the fallback-to-literal-string
  rule (§1/§3's resolution steps 1–4 are not implemented; only step 5 is).
- Expressions with operators, comparisons, unary negation.
- Control flow (`if`/`elseif`/`else`, `for`, `while`), `local`, `fn`.
- `include`.
- `script {}` / Lua (this is the Full-conformance-level question from
  `scorium-spec §7`, itself still unapproved — not started either way).
- The canonical formatter (`scorium-spec §4`).
- The full diagnostic code catalog (`scorium-spec §5`) — errors thrown
  today are plain `Error`s, not yet tagged with `scorium::*` codes.
- Sandbox resource limits (`scorium-spec §6`).

## Conformance

`npm run conformance` runs `scripts/conformance.ts` against
`../scorium-spec/conformance/0.2.0-draft/values/*.json` (relative sibling
checkout — this only works when `scorium-spec` is checked out alongside
this repo, e.g. both under `scorium-lang/`). Only the `values/` fixture
category is in scope right now, for the reason above: every other
category exercises language features this build doesn't have yet.

## Requirements

Node.js 22+. This repo runs TypeScript source files directly (no build
step in development) — Node's native TypeScript support strips types at
runtime. `npm run typecheck` runs `tsc --noEmit` for real type-checking.
