# Changelog

## 0.7.0-dev — unreleased

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

## 0.6.0-dev — unreleased

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

## 0.5.0-dev — unreleased

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

## 0.4.0-dev — unreleased

Member/method calls (`primary.darken(1.0)`) and, discovered while
verifying the `color-darken-method` fixture, identifier resolution
step 3 (sibling-leaf reference) -- `primary` in that fixture isn't a
variable, it's the leaf set two lines above, which the earlier
"steps 1/2/5 only" resolution couldn't reach. Both landed together
since the fixture genuinely needed both.

21/21 runnable `scorium-spec` conformance fixtures now pass (up from
20/21) -- the entire non-Lua language core except `include` is done.

## 0.3.0-dev — unreleased

Control flow (`if`/`elseif`/`else`, numeric `for` with optional step,
`while`), `local` + leaf-reassignment, `fn` definitions, and calls
(statement- and expression-position). Reassignment correctly excludes
function parameters and `for` loop variables (only a genuine `local`
is reassignable via `n = n + 1`) — verified against a real
`scorium-rust` edge case where a leaf name colliding with a fn
parameter must still emit, not silently vanish.

20/21 runnable `scorium-spec` conformance fixtures now pass (up from
16/21); the one failure needs member/method calls (`color.darken()`),
the last missing postfix-expression form.

## 0.2.0-dev — unreleased

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

## 0.1.0-dev — unreleased

Initial skeleton and first functional slice: lexer, parser, and evaluator
for the **declarative literal subset only** (nodes, leaves, and the eight
value types — no variables, expressions/operators, control flow,
functions, `include`, or `script {}` yet). Verified against the `values/`
category of `scorium-spec`'s `0.2.0-draft` conformance fixtures (8/8
passing). No Rust dependency anywhere in this package.
