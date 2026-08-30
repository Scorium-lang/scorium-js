# Changelog

## 0.1.0-dev — unreleased

Initial skeleton and first functional slice: lexer, parser, and evaluator
for the **declarative literal subset only** (nodes, leaves, and the eight
value types — no variables, expressions/operators, control flow,
functions, `include`, or `script {}` yet). Verified against the `values/`
category of `scorium-spec`'s `0.2.0-draft` conformance fixtures (8/8
passing). No Rust dependency anywhere in this package.
