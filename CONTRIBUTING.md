# Contributing to scorium-js

Thank you for your interest in contributing to scorium-js. This document
covers the practical side of contributing. The legal side is covered in
[CONTRIBUTION_PERMISSION.md](./CONTRIBUTION_PERMISSION.md) and
[CONTRIBUTOR_TERMS.md](./CONTRIBUTOR_TERMS.md); please read both before
opening a pull request.

## Project status and scope

scorium-js is the native TypeScript implementation of
[Scorium](https://github.com/Scorium-lang/scorium-spec). The full non-Lua
language core -- lexer, parser, AST, typed values, variables, expressions,
control flow, functions, `include`, the canonical formatter, sandbox
resource limits, and a host function/value registry -- is implemented and
passes the entire `scorium-spec` conformance corpus. `script { }` (raw Lua)
parses and formats correctly but is not executable: no Lua VM is embedded
yet, which is a language-family-level decision tracked in
[`scorium-spec`'s §7 conformance-levels proposal](https://github.com/Scorium-lang/scorium-spec),
not something to work around unilaterally here.

Good first contributions:

- Bug fixes with a regression test (a new conformance fixture, or a local
  test if the bug is scorium-js-specific rather than language-level).
- Documentation improvements.
- Performance work on the lexer/parser hot paths.
- Clearer diagnostic messages (the `.code` is normative; message text is
  not, so it's safe to improve without coordinating with other
  implementations).

Please open an issue before large feature work -- especially anything
touching `script { }`/Lua, which depends on a family-wide decision this
repository alone can't make -- so the design can be agreed before you
invest time in it.

## How to contribute

1. Fork the repository on GitHub (this is explicitly permitted by
   [CONTRIBUTION_PERMISSION.md](./CONTRIBUTION_PERMISSION.md)).
2. Create a branch whose primary purpose is preparing a contribution back
   to the official project.
3. Make your change. Match the surrounding style; keep modules focused.
4. Add or update tests. Do not weaken tests to make the build pass.
5. Make sure everything passes (see "Verification" below).
6. Open a pull request describing what changed and why.

## Verification

Before submitting, run from the repository root:

```bash
npm run typecheck
npm test
```

Both must pass. The CI workflow enforces the same. `npm test` runs the
vendored `scorium-spec` conformance corpus (see
[`fixtures/README.md`](./fixtures/README.md) if your change needs an
updated or new fixture).

## Maintainer release process

Releases are published automatically from successful CI runs on `main`.
Update the version in both `package.json` and `package-lock.json`, then
merge or push the release commit to `main`. After typechecking, building,
and conformance testing pass, CI compares the local version with the
versions already on npm. It publishes only when the local version is newer
than every published version; equal versions are skipped and version
downgrades fail. After npm succeeds, CI creates the matching
`v<package-version>` Git tag and GitHub Release at the exact release commit.
Documentation-only pushes and unchanged versions do not create new tags or
releases.

Publishing uses npm Trusted Publishing with GitHub Actions OIDC; no npm
access token is stored in GitHub. In the npm package settings, configure
the trusted publisher with these exact values:

- Provider: GitHub Actions
- Organization or user: `Scorium-lang`
- Repository: `scorium-js`
- Workflow filename: `ci.yml`
- Allowed action: `npm publish`

The initial `0.9.0` publication and Trusted Publishing setup are complete;
future versions are published by CI with short-lived OIDC credentials.
The publish job has GitHub `contents: write` only so it can create the
version tag and Release after npm succeeds. Checkout never persists that
token.

## Code quality expectations

- **Strict TypeScript.** `tsconfig.json`'s `strict` mode stays on; don't
  work around a type error with `any` or a non-null assertion that isn't
  actually guaranteed.
- **No parameter properties or other constructor-generating TS syntax**
  Node's native type-stripping (this repo's whole point: no build step in
  development) only erases types, it doesn't transform code -- anything
  that would need real codegen (parameter properties, `enum`,
  experimental decorators) isn't usable here.
- **Documented public APIs.** Every exported item carries a doc comment
  explaining non-obvious behavior -- not what the code already says via
  naming, but the constraint or spec section behind it.
- **Small modules.** Prefer focused files over oversized ones.
- **Deterministic tests.** No network, no reliance on wall-clock time, no
  hidden filesystem assumptions beyond a writable temp directory (`include`
  fixtures already need one; see `scripts/conformance.ts`).
- **Match `scorium-spec`, not `scorium-rust`, when they'd ever disagree.**
  The Rust implementation is the current reference implementation, useful
  as ground truth for behavior the spec hasn't nailed down yet, but the
  spec is the authority once both exist for a given rule.

## Tests

The primary test suite is the vendored `scorium-spec` conformance corpus
under `fixtures/`, run via `scripts/conformance.ts`. When you add a
language feature, prefer adding a fixture (upstreamed to `scorium-spec`
first, then vendored here) over a scorium-js-only test, since a fixture
also protects every other implementation. A scorium-js-only test is
appropriate for something genuinely implementation-specific (a parser
internals edge case, a TypeScript API-surface behavior).

## Commit messages and history

Write clear commit messages in the imperative mood ("add color darken
method", not "added"). Prefer several small, logically-scoped commits over
one large one. Keep history readable; the maintainers may squash or rebase
before merging.

## Licensing of contributions

By submitting a pull request, you agree to
[CONTRIBUTOR_TERMS.md](./CONTRIBUTOR_TERMS.md), which grants @fi3w0 the
rights needed to maintain, distribute, relicense, and commercially license
Scorium. Scorium is source-available under PolyForm Strict 1.0.0; it is
**not OSI-approved open source**, and contributors must be comfortable with
that.

## Conduct

Be kind and technical. Assume good faith. Critique the work, not the
person.

---

**Legal notice.** These contribution instructions are initial project
terms. They have not been reviewed by a lawyer.
