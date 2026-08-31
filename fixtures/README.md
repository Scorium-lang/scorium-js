# Vendored conformance fixtures

`v0.2.1/` is a **vendored copy** of `scorium-spec/conformance/v0.2.1/`,
not a live reference. Vendoring keeps this repo self-contained and its CI
runnable from a fresh clone. The directory currently contains all 56 fixtures;
the Lua-required case is capability-skipped by this implementation.

## Keeping this in sync

When `scorium-spec`'s `conformance/` changes, re-copy the matching version:

```sh
rm -rf fixtures/v0.2.1
cp -r ../scorium-spec/conformance/v0.2.1 fixtures/
```

(assumes `scorium-spec` is checked out as a sibling directory, the same
assumption `scripts/conformance.ts` used before this vendoring existed).

For local development against a `scorium-spec` you're actively editing,
set `SCORIUM_SPEC_FIXTURES` to point at its live `conformance/<version>/`
directory instead of using this vendored copy:

```sh
SCORIUM_SPEC_FIXTURES=../scorium-spec/conformance/v0.2.1 npm run conformance
```
