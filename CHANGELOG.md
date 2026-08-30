# Changelog

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
