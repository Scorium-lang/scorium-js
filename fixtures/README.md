# Vendored conformance fixtures

`v0.2.0/` is a **vendored copy** of `scorium-spec/conformance/v0.2.0/`,
not a live reference -- `scorium-spec` has no GitHub repo of its own yet,
so CI here can't check it out as a dependency. Vendoring keeps this repo
self-contained and its CI runnable from a fresh clone.

Vendored from `scorium-spec` commit `4605e075d4c5cfd2ebfe5577004428467ad6a37f`
(2026-08-30). When `scorium-spec` gets a real repo and a release process,
this should become a real dependency (git submodule, fetched artifact,
or published package) instead of a manual copy.

## Keeping this in sync

There's no automation for this yet -- when `scorium-spec`'s
`conformance/` changes, re-copy it by hand:

```sh
rm -rf fixtures/v0.2.0
cp -r ../scorium-spec/conformance/v0.2.0 fixtures/
```

(assumes `scorium-spec` is checked out as a sibling directory, the same
assumption `scripts/conformance.ts` used before this vendoring existed).

For local development against a `scorium-spec` you're actively editing,
set `SCORIUM_SPEC_FIXTURES` to point at its live `conformance/<version>/`
directory instead of using this vendored copy:

```sh
SCORIUM_SPEC_FIXTURES=../scorium-spec/conformance/v0.2.0 npm run conformance
```
