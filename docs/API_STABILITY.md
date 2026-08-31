# API stability

**Status: pre-1.0 (`scorium` is at `0.9.5` on npm).** This document
describes how the JavaScript/TypeScript *implementation's* API changes over
time. It is unrelated to the Scorium *language* version (`scorium-spec`'s
`0.2.1`), which follows its own scheme (`scorium-spec`'s
`spec/00-overview.md`, "Versioning").

## What a version bump means here

npm SemVer pre-1.0 rules apply literally: a `0.x` -> `0.(x+1)` bump MAY break
the public API exported from `src/index.ts`. A `0.x.y` -> `0.x.(y+1)` patch
bump MUST NOT break it. There is no unversioned "internal API" carve-out --
anything exported from `src/index.ts` is the public surface; anything not
re-exported there (e.g. a helper inside `src/eval.ts`) can change freely in
a patch release because it was never part of the contract.

## Stability tiers

Not every export has had equal exposure. Treat these differently when
deciding how tightly to pin a dependency:

- **Established** -- `parse`, `evaluate`, `format`, and their option/error
  types. Exercised by the full conformance corpus since `0.9.0`; changes
  here are usually additive or fixing a real conformance gap.
- **Newer, less exposed** -- the `Schema`/`NodeSchema` builders (including
  the deterministic missing-key ordering fix in this release), `load`/
  `loadSource`, and the CLI's `--json` output shapes. Behavior is
  intentional and tested, but has had one real external consumer
  (AquaTTY, via `scorium-go`, not this package directly) for a matter of
  days, not months.

`scorium.ast/1` (the `parse --json` syntax tree) and the `check --json`
diagnostic envelope are versioned independently as part of
[scorium-spec's tooling contract](https://github.com/Scorium-lang/scorium-spec/blob/main/tooling/README.md)
rather than by this package's own version -- a `v1` contract is
additive-only by definition; a breaking change would ship as `v2` alongside
`v1`, not replace it silently.

## Deprecation policy

Before removing a public export:

1. Add a `@deprecated` JSDoc tag pointing at its replacement -- editors and
   `tsc` surface this at every call site.
2. Note the deprecation in `CHANGELOG.md` under `### Deprecated`.
3. Keep it working for at least one further minor version.
4. Remove it in a subsequent minor version, noted under `### Removed`.

A deprecation and its removal are never the same version bump, so consumers
get at least one release cycle of editor warnings before an import breaks.

## Upgrading

- Read `CHANGELOG.md`'s `### Added`/`### Changed`/`### Removed` sections for
  the versions between what you have and what you're moving to -- they are
  the authoritative diff, not this document.
- Pin an exact version (`"scorium": "0.9.5"`) if you want zero surprises
  pre-1.0; accept `^0.9` only if you're prepared to read the changelog
  before every `npm update`.
- Run `npm run typecheck` after any upgrade -- a removed or renamed export
  fails at compile time, not silently at runtime.
