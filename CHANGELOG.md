# Changelog

## 0.9.2 -- 2026-08-30

Closed the three biggest gaps against `scorium-rs`'s tooling.

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

## 0.9.1 -- 2026-08-30

Updated the implementation to stable Scorium language version `0.2.0` and
vendored its 34-fixture conformance corpus. The conformance runner now applies
fixture-specific loop and function-depth limits instead of relying on package
defaults.

Fixed `return` semantics: using it outside a Scorium function now raises
`scorium::eval::return_outside_function`, while a return inside nested control
flow, a node body, or an included file propagates to the active function.

GitHub Releases now use the matching section of this changelog as their
release body and fail safely when the version section is missing or empty.

## 0.9.0 -- 2026-08-30

First published release, to npm as `scorium`. Dropped the `-dev` suffix
this version carried during development -- npm refuses to publish a
prerelease-suffixed version to the default `latest` dist-tag, and
`npm install scorium` resolving to a working, unsuffixed version was
the point.

Publish-readiness. Vendored the `scorium-spec` conformance fixtures
into `fixtures/` (it has no GitHub repo of its own yet, so CI can't
check it out) with an `SCORIUM_SPEC_FIXTURES` override for local
development against a live sibling checkout. Added CI (typecheck,
build, the full 31-fixture conformance run) and the org-wide/adapted
legal and contribution docs (`LICENSE`, `TRADEMARKS.md`,
`CONTRIBUTOR_TERMS.md`, `CONTRIBUTION_PERMISSION.md`, `COMMERCIAL.md`
copied from `scorium-rust` verbatim or near-verbatim; `CONTRIBUTING.md`
and `SECURITY.md` adapted for this ecosystem). Rewrote `README.md` in
the same structural style as `scorium-rust`'s, now with a real Node/TS
usage section.

Caught and fixed a real gap while verifying the package would actually
work once installed, not just imported from within this repo: Node
explicitly refuses to strip TypeScript types for anything under
`node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so
shipping raw `.ts` as the published entry point -- this repo's whole
"no build step" premise for local development -- would have been
completely broken for real consumers, even though everything worked
fine in-repo. Added a real build step (`tsc -p tsconfig.build.json`,
using TypeScript 5.9's `rewriteRelativeImportExtensions` to keep
authoring with explicit `.ts` import specifiers for Node's native
dev-time stripping while still emitting valid `.js`), pointed
`package.json`'s `main`/`exports`/`files` at the compiled `dist/`
output, and verified end-to-end with a real `npm pack` + install into
a scratch project, not just `tsc --noEmit`.

Decided the npm package name: `scorium` (unscoped; confirmed available
on the registry, matches the language name directly, already what
`package.json` had).

31/31 conformance fixtures still pass, both from the vendored copy and
against a live `scorium-spec` checkout via the override.

## 0.8.0-dev -- unreleased

The host function/value registry (scorium-spec §6's "one registry,
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
conformance/README.md), so this was verified directly against
scorium-rust's own equivalent tests instead (`select()` returning its
first argument, an `environment` host value driving an `if`/`else`,
and a Scorium `fn` shadowing a same-named host function).

31/31 `scorium-spec` conformance fixtures still pass (unaffected --
no fixture exercises this path). The language core, including every
identifier-resolution step, is now complete; only `script {}`
execution remains, gated on scorium-spec §7.

## 0.7.0-dev -- unreleased

Sandbox resource limits (scorium-spec §3/§6): a total loop-iteration
budget shared across the whole evaluation and a function call-depth
limit, both configurable via `evaluate(doc, { sandbox })`, defaulting
to scorium-rust's own values. And structured diagnostics: every error
is now a `ScoriumError` (`LexError`/`ParseError`/`EvalError`) exposing
a real `.code` field, extracted from the existing message-text
convention rather than requiring every throw site to change.

Turning on precise `.code` checking in the conformance runner (in
place of the looser `message.includes(code)` it used before)
immediately caught a real gap: `Value`'s integer-overflow check threw
a plain `Error`, not an `EvalError` -- invisible under substring
matching, since the code text still appeared in the message, but a
real bug for anyone catching on `.code` or `instanceof EvalError`.
Fixed.

31/31 fixtures in the entire `scorium-spec` conformance corpus now
pass, including `sandbox/` -- safe to run for the first time now that
the limits it exercises actually exist (confirmed: still under a
second to run the whole suite). The full non-Lua language core is
implemented.

## 0.6.0-dev -- unreleased

The canonical formatter (`scorium-spec §4`): comment/blank-line trivia
now tracked through the lexer and parser (previously discarded
entirely), precedence-driven expression printing, and the literal-
formatting rules. Verified byte-for-byte against real `scorium-rust`
canonical output beyond the JSON fixtures (`for`, `if`/`else`, `fn`,
`include`) -- that check caught and fixed a real bug where a blank
line immediately after the *first* item in a body was lost, because
the old separator-newline consumption and the new blank-line counter
were racing over the same tokens.

Also fixed, found while spot-checking `script {}` formatting: `script`
wasn't a reserved word, so `script { local x = 1 + 1 }` was silently
misparsed as a **node named "script"** containing a `local` statement
-- it happened to format back to identical text purely by coincidence
(the Lua matched valid Scorium syntax), which would have broken
silently on any real Lua that didn't. `script {}` is now raw-captured
verbatim at the lexer level (byte-for-byte preserved on format, never
parsed as Scorium) and evaluating one now raises a clear
`scorium::eval::script_error` -- no Lua VM is embedded -- instead of
either misparsing or silently succeeding.

29/29 runnable `scorium-spec` conformance fixtures now pass (up from
23/23 -- the `formatter/` category is now run). The entire non-Lua
language core, including the formatter, is implemented.

## 0.5.0-dev -- unreleased

`include`: file reading, cycle detection, and path-containment policy
per `scorium-spec §6` -- canonicalize (resolve symlinks) both the
include root and the resolved target and require containment, not
just a textual `..`/absolute-path check, since a relative path can
still escape through a symlink. `evaluate()` now takes an optional
`{ baseDir, includePolicy }`.

23/23 runnable `scorium-spec` conformance fixtures now pass (up from
21/21 -- both `include` fixtures, previously skipped for lack of
multi-file support, now run for real). The entire non-Lua language
core is implemented; remaining work is the formatter, the rest of the
diagnostic catalog, and sandbox resource limits.

## 0.4.0-dev -- unreleased

Member/method calls (`primary.darken(1.0)`) and, discovered while
verifying the `color-darken-method` fixture, identifier resolution
step 3 (sibling-leaf reference) -- `primary` in that fixture isn't a
variable, it's the leaf set two lines above, which the earlier
"steps 1/2/5 only" resolution couldn't reach. Both landed together
since the fixture genuinely needed both.

21/21 runnable `scorium-spec` conformance fixtures now pass (up from
20/21) -- the entire non-Lua language core except `include` is done.

## 0.3.0-dev -- unreleased

Control flow (`if`/`elseif`/`else`, numeric `for` with optional step,
`while`), `local` + leaf-reassignment, `fn` definitions, and calls
(statement- and expression-position). Reassignment correctly excludes
function parameters and `for` loop variables (only a genuine `local`
is reassignable via `n = n + 1`) -- verified against a real
`scorium-rust` edge case where a leaf name colliding with a fn
parameter must still emit, not silently vanish.

20/21 runnable `scorium-spec` conformance fixtures now pass (up from
16/21); the one failure needs member/method calls (`color.darken()`),
the last missing postfix-expression form.

## 0.2.0-dev -- unreleased

Variables (`@name`) and full expressions: arithmetic (checked `Int`
overflow, `Int`/`Int` division always `Float`, Euclidean `%`),
comparison (exact `Int`/`Float` ordering, never casting the integer
through `f64`), logic (`and`/`or`/`not`), unary negation, grouping
parens, and `$name` bare-string interpolation. The lexer's `+`/`-`
embedding rule (`SUPER+Return`, `node-1` stay one bare word; every other
operator errors when squeezed) and the `dollar_in_expression` /
`at_in_expression` diagnostics came with it.

16/21 runnable `scorium-spec` conformance fixtures now pass (up from
8/8 `values/`-only); the 5 failures are all control-flow/function/
method-call fixtures, explicitly still out of scope (see README.md).

## 0.1.0-dev -- unreleased

Initial skeleton and first functional slice: lexer, parser, and evaluator
for the **declarative literal subset only** (nodes, leaves, and the eight
value types -- no variables, expressions/operators, control flow,
functions, `include`, or `script {}` yet). Verified against the `values/`
category of `scorium-spec`'s `0.2.0-draft` conformance fixtures (8/8
passing). Published as a self-contained TypeScript/JavaScript package.
