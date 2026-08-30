# Changelog

All notable changes to Scorium are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches 1.0. Until then, the public API may change between minor
versions.

## [Unreleased]

## [0.9.4] - 2026-08-30

### Fixed
- `SCORIUM_LANGUAGE_VERSION` reported `"0.2.0-draft"`, stale since the
  language version was promoted to stable `0.2.0` earlier. Found while
  researching `scorium-js` as a porting template for `scorium-go`.

## [0.9.3] - 2026-08-30

### Added
- A `hostCall` `Entry` kind: a standalone call to a *host*-registered
  function used as a full statement now emits an entry recording its
  name, arguments, and result, matching `scorium-rs`'s `Entry::HostCall`.
  A call to a Scorium `fn` this way still emits nothing extra, only what
  the `fn` body itself produces. This is an implementation capability,
  not conformance-mandated behavior -- host-integration entries remain
  outside the `0.2.0` corpus's scope per `scorium-spec`'s own
  `conformance/README.md`.
- `scorium eval --json` prints the evaluated tree as tagged-value JSON,
  using the same encoding as `scorium-spec`'s conformance fixtures,
  instead of only the human-readable outline.
- `scorium fmt --check` now prints a line diff of what would change, not
  just that the file isn't formatted.
- `examples/` with the same four `.scor` files `scorium-rs` ships
  (`basic.scor`, `variables.scor`, `conditions.scor`, `loops.scor`) and
  an `examples/embedding/` script mirroring `scorium-rs`'s: parse,
  evaluate with a registered host value and function, validate against a
  schema, inspect, and format.
- `docs/EMBEDDING.md` now documents schema validation (it existed in
  code and `README.md` but was missing from the embedding guide).

### Fixed
- The schema `"boolean"` value type never actually matched a real
  boolean value -- `Value.kind` is `"bool"`, not `"boolean"`, and the
  type-check only special-cased `"integer"`/`"float"`, so every
  `"boolean"`-typed key was silently rejecting valid documents. Found
  while verifying `docs/EMBEDDING.md`'s new schema example actually
  runs.

## [0.9.2] - 2026-08-30

Closed the three biggest gaps against `scorium-rs`'s tooling.

### Added
- **Structured diagnostics.** Every `ScoriumError` now carries `.span`
  (byte offsets), `.location`/`.endLocation` (line/column), `.sourceName`,
  and a `.format()` renderer producing the same `path:line:column` +
  excerpt + underline shape the CLI prints. Evaluated `Entry` values also
  retain their declaration span.
- **Schema validation.** A new `Schema`/`NodeSchema` builder API validates
  an evaluated tree, with `scorium::schema::*` diagnostic codes matching
  `scorium-rs`'s `scorium-schema` crate exactly (`unknown_node`,
  `unknown_key`, `missing_required_key`, `wrong_type`, `duplicate_key`,
  `invalid_header`), including did-you-mean suggestions on unknown keys.
- **CLI.** `npx scorium check|parse|fmt|eval <file>` mirrors
  `scorium-cli`'s subcommands (`fmt --check` included) and its
  generic-runtime framing -- no host functions or schema attached, since
  those are an embedding application's responsibility. Runs directly from
  TypeScript source via Node's native type-stripping, same as the rest of
  the package.

## [0.9.1] - 2026-08-30

### Changed
- Updated the implementation to stable Scorium language version `0.2.0`
  and vendored its 34-fixture conformance corpus.
- The conformance runner now applies fixture-specific loop and
  function-depth limits instead of relying on package defaults.
- GitHub Releases now use the matching section of this changelog as their
  release body and fail safely when the version section is missing or
  empty.

### Fixed
- `return` semantics: using it outside a Scorium function now raises
  `scorium::eval::return_outside_function`, while a return inside nested
  control flow, a node body, or an included file propagates to the
  active function.

## [0.9.0] - 2026-08-30

First published release, to npm as `scorium`.

### Added
- CI (typecheck, build, the full 31-fixture conformance run).
- The org-wide/adapted legal and contribution docs (`LICENSE`,
  `TRADEMARKS.md`, `CONTRIBUTOR_TERMS.md`, `CONTRIBUTION_PERMISSION.md`,
  `COMMERCIAL.md` copied from `scorium-rust` verbatim or near-verbatim;
  `CONTRIBUTING.md` and `SECURITY.md` adapted for this ecosystem).
- A real build step (`tsc -p tsconfig.build.json`, using TypeScript
  5.9's `rewriteRelativeImportExtensions` to keep authoring with
  explicit `.ts` import specifiers for Node's native dev-time stripping
  while still emitting valid `.js`).

### Changed
- Dropped the `-dev` suffix this version carried during development --
  npm refuses to publish a prerelease-suffixed version to the default
  `latest` dist-tag, and `npm install scorium` resolving to a working,
  unsuffixed version was the point.
- Vendored the `scorium-spec` conformance fixtures into `fixtures/` (it
  has no GitHub repo of its own yet, so CI can't check it out) with an
  `SCORIUM_SPEC_FIXTURES` override for local development against a live
  sibling checkout.
- Rewrote `README.md` in the same structural style as `scorium-rust`'s,
  now with a real Node/TS usage section.
- `package.json`'s `main`/`exports`/`files` now point at the compiled
  `dist/` output.
- Decided the npm package name: `scorium` (unscoped; confirmed available
  on the registry, matches the language name directly, already what
  `package.json` had).

### Fixed
- Caught and fixed a real gap while verifying the package would actually
  work once installed, not just imported from within this repo: Node
  explicitly refuses to strip TypeScript types for anything under
  `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so
  shipping raw `.ts` as the published entry point -- this repo's whole
  "no build step" premise for local development -- would have been
  completely broken for real consumers, even though everything worked
  fine in-repo. Verified end-to-end with a real `npm pack` + install
  into a scratch project, not just `tsc --noEmit`.

## [0.8.0-dev] - unreleased

### Added
- The host function/value registry (scorium-spec §6's "one registry,
  multiple surfaces"): `evaluate(doc, { hostFunctions, hostValues })`.
  A host function is callable exactly like a Scorium `fn`, with a
  Scorium `fn` of the same name taking priority (matches scorium-rust's
  own precedence); a host value resolves as a plain identifier --
  identifier resolution step 4, the last of the five steps in
  scorium-spec §1 to land. A throw inside a host function is wrapped as
  `scorium::eval::type_error`, matching scorium-rust's
  `Result<Value, String>` host-function contract.

No conformance fixture exists for this yet (host-integration fixtures
are a deliberately separate, undesigned corpus per scorium-spec's own
`conformance/README.md`), so this was verified directly against
scorium-rust's own equivalent tests instead (`select()` returning its
first argument, an `environment` host value driving an `if`/`else`, and
a Scorium `fn` shadowing a same-named host function). The language core,
including every identifier-resolution step, is now complete; only
`script {}` execution remains, gated on scorium-spec §7.

## [0.7.0-dev] - unreleased

### Added
- Sandbox resource limits (scorium-spec §3/§6): a total loop-iteration
  budget shared across the whole evaluation and a function call-depth
  limit, both configurable via `evaluate(doc, { sandbox })`, defaulting
  to scorium-rust's own values.
- Structured diagnostics: every error is now a `ScoriumError`
  (`LexError`/`ParseError`/`EvalError`) exposing a real `.code` field,
  extracted from the existing message-text convention rather than
  requiring every throw site to change.

### Fixed
- Turning on precise `.code` checking in the conformance runner (in
  place of the looser `message.includes(code)` it used before)
  immediately caught a real gap: `Value`'s integer-overflow check threw
  a plain `Error`, not an `EvalError` -- invisible under substring
  matching, since the code text still appeared in the message, but a
  real bug for anyone catching on `.code` or `instanceof EvalError`.

The full non-Lua language core is implemented as of this version,
including `sandbox/` fixtures -- safe to run for the first time now
that the limits it exercises actually exist.

## [0.6.0-dev] - unreleased

### Added
- The canonical formatter (scorium-spec §4): comment/blank-line trivia
  now tracked through the lexer and parser (previously discarded
  entirely), precedence-driven expression printing, and the
  literal-formatting rules. Verified byte-for-byte against real
  `scorium-rust` canonical output beyond the JSON fixtures (`for`,
  `if`/`else`, `fn`, `include`).

### Fixed
- A blank line immediately after the *first* item in a body was lost,
  because the old separator-newline consumption and the new blank-line
  counter were racing over the same tokens -- caught by the
  byte-for-byte `scorium-rust` comparison above.
- `script` wasn't a reserved word, so `script { local x = 1 + 1 }` was
  silently misparsed as a **node named "script"** containing a `local`
  statement -- it happened to format back to identical text purely by
  coincidence (the Lua matched valid Scorium syntax), which would have
  broken silently on any real Lua that didn't. `script {}` is now
  raw-captured verbatim at the lexer level (byte-for-byte preserved on
  format, never parsed as Scorium) and evaluating one now raises a
  clear `scorium::eval::script_error` -- no Lua VM is embedded --
  instead of either misparsing or silently succeeding.

The entire non-Lua language core, including the formatter, is
implemented as of this version.

## [0.5.0-dev] - unreleased

### Added
- `include`: file reading, cycle detection, and path-containment policy
  per scorium-spec §6 -- canonicalize (resolve symlinks) both the
  include root and the resolved target and require containment, not
  just a textual `..`/absolute-path check, since a relative path can
  still escape through a symlink. `evaluate()` now takes an optional
  `{ baseDir, includePolicy }`.

The entire non-Lua language core is implemented as of this version;
remaining work is the formatter, the rest of the diagnostic catalog,
and sandbox resource limits.

## [0.4.0-dev] - unreleased

### Added
- Member/method calls (`primary.darken(1.0)`).

### Fixed
- Identifier resolution step 3 (sibling-leaf reference), discovered
  while verifying the `color-darken-method` fixture -- `primary` in
  that fixture isn't a variable, it's the leaf set two lines above,
  which the earlier "steps 1/2/5 only" resolution couldn't reach. Both
  landed together since the fixture genuinely needed both.

The entire non-Lua language core except `include` is done as of this
version.

## [0.3.0-dev] - unreleased

### Added
- Control flow (`if`/`elseif`/`else`, numeric `for` with optional step,
  `while`), `local` + leaf-reassignment, `fn` definitions, and calls
  (statement- and expression-position).

Reassignment correctly excludes function parameters and `for` loop
variables (only a genuine `local` is reassignable via `n = n + 1`) --
verified against a real `scorium-rust` edge case where a leaf name
colliding with a fn parameter must still emit, not silently vanish. The
one remaining fixture failure at this version needs member/method calls
(`color.darken()`), the last missing postfix-expression form.

## [0.2.0-dev] - unreleased

### Added
- Variables (`@name`) and full expressions: arithmetic (checked `Int`
  overflow, `Int`/`Int` division always `Float`, Euclidean `%`),
  comparison (exact `Int`/`Float` ordering, never casting the integer
  through `f64`), logic (`and`/`or`/`not`), unary negation, grouping
  parens, and `$name` bare-string interpolation.
- The lexer's `+`/`-` embedding rule (`SUPER+Return`, `node-1` stay one
  bare word; every other operator errors when squeezed) and the
  `dollar_in_expression`/`at_in_expression` diagnostics.

The remaining fixture failures at this version are all
control-flow/function/method-call fixtures, explicitly still out of
scope for this release (see `README.md`).

## [0.1.0-dev] - unreleased

### Added
- Initial skeleton and first functional slice: lexer, parser, and
  evaluator for the **declarative literal subset only** (nodes, leaves,
  and the eight value types -- no variables, expressions/operators,
  control flow, functions, `include`, or `script {}` yet). Verified
  against the `values/` category of `scorium-spec`'s `0.2.0-draft`
  conformance fixtures. Published as a self-contained TypeScript/
  JavaScript package.
