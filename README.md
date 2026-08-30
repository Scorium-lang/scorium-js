# scorium

[![npm](https://img.shields.io/npm/v/scorium?style=flat-square&color=8EDDFF)](https://www.npmjs.com/package/scorium)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-pre--1.0-8EDDFF?style=flat-square)](./CHANGELOG.md)
[![Source Available](https://img.shields.io/badge/source-available-8EDDFF?style=flat-square)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/Scorium-lang/scorium-js?style=flat-square&logo=github)](https://github.com/Scorium-lang/scorium-js/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/Scorium-lang/scorium-js?style=flat-square&logo=github)](https://github.com/Scorium-lang/scorium-js/issues)

**Readable on the surface. Programmable when you need it.**

Scorium is a readable, programmable configuration language. It keeps
ordinary configuration declarative while allowing expressions, conditions,
loops, and functions when static data is not enough. **scorium-js is its
native TypeScript/JavaScript implementation.** It exposes the shared,
versioned Scorium language contract through idiomatic APIs for JavaScript and
TypeScript applications. Rust, JavaScript/TypeScript, and future supported
languages are peer implementations; compatibility comes from the same
specification and conformance fixtures, not from one implementation wrapping
another.

```scor
@base_port = 8000

server {
    host = localhost
    port = base_port + 80
    timeout = 5s
    enabled = true
}

for i = 1, 3 do
    worker {
        name = worker-$i
        index = i
    }
end
```

A beginner writes ordinary data and never touches the programmable layer.
An advanced user adds logic without migrating to another file format --
see [Scorium's design principle](https://github.com/Scorium-lang/scorium-spec)
for why that's the language's whole point, not an incidental feature.

## Install

```bash
npm install scorium
```

Requires Node.js 22+.

## Usage

```ts
import { parse, evaluate, format } from "scorium";

const source = `
server {
    port = 8080
    timeout = 5s
    enabled = true
}
`;

const doc = parse(source);
const entries = evaluate(doc);
// [{ kind: "node", name: "server", header: null, children: [
//   { kind: "leaf", key: "port", value: { kind: "int", value: 8080n } },
//   { kind: "leaf", key: "timeout", value: { kind: "duration", amount: 5, unit: "s" } },
//   { kind: "leaf", key: "enabled", value: { kind: "bool", value: true } },
// ]}]

console.log(format(doc)); // canonical formatting, byte-identical to every other Scorium implementation
```

Handling errors -- every thrown error carries a real `.code`, not just a
message to pattern-match:

```ts
import { parse, evaluate, EvalError } from "scorium";

try {
  evaluate(parse("x = 1 / 0"));
} catch (err) {
  if (err instanceof EvalError && err.code === "scorium::eval::division_by_zero") {
    // handle it
  }
}
```

Registering host functions and values (identifier resolution step 4 --
"one registry, multiple surfaces"):

```ts
evaluate(parse("terminal = pick(kitty, alacritty)"), {
  hostFunctions: {
    pick: (args) => args[0] ?? { kind: "nil" },
  },
  hostValues: {
    environment: { kind: "string", value: "production" },
  },
});
```

Sandbox limits and `include` behavior are configurable the same way --
see the [embedding guide](./docs/EMBEDDING.md) for the complete API.

## Current scope

The entire non-Lua Scorium language core is implemented for stable language
version **`0.2.0`** and passes **34/34** of `scorium-spec`'s conformance
fixtures: the declarative
surface, variables and interpolation, full expressions (exact `Int`/
`Float` semantics -- `Int` is backed by `bigint`, not `number`, to
represent the full 64-bit signed range exactly), control flow, functions,
member/method calls, `include` (with real path-containment and cycle
detection), the canonical formatter, sandbox resource limits, and
structured `.code`-bearing diagnostics.

**Not implemented:** `script { }` *execution* -- no Lua VM is embedded.
A document containing one still parses and formats correctly; evaluating
it raises a clear error rather than silently doing nothing. Whether and
how scorium-js ever executes Lua is a family-wide decision tracked in
the implementation's host and sandbox strategy; stable Scorium `0.2.0`
explicitly permits implementations without Lua execution.

## Status

The language core and its conformance verification are done; this is a
real, working, embeddable implementation, but it is pre-1.0 and the
public API may change. See [docs/ROADMAP.md](./docs/ROADMAP.md) for what
exists and what is deferred, and [CHANGELOG.md](./CHANGELOG.md) for what
shipped and when.

## Documentation

- [Language guide](./docs/LANGUAGE.md) -- start here.
- [Grammar](./docs/GRAMMAR.md) -- the implemented grammar.
- [Embedding](./docs/EMBEDDING.md) -- the TypeScript API for hosts.
- [Diagnostics](./docs/DIAGNOSTICS.md) -- the diagnostic catalogue.
- [Security model](./docs/SECURITY.md) -- evaluator and host responsibility.
- [Roadmap](./docs/ROADMAP.md) -- what exists and what is deferred.

## Security

There is no `script { }` execution yet, so there is no Lua sandbox
surface to secure -- the threat model today is the native language core's
own resource limits (loop budget, call-depth limit) and `include` path
containment. See [docs/SECURITY.md](./docs/SECURITY.md) for the detailed
model and [SECURITY.md](./SECURITY.md) for private vulnerability reporting.

## Licensing

Scorium is **source-available** under the
[PolyForm Strict License 1.0.0](./LICENSE). It is free for personal,
educational, hobby, and local noncommercial use, and for
contribution-focused forks. **Commercial use requires a written
agreement.**

Scorium is *not* OSI-approved open source. Only official releases
published by @fi3w0 (npm, GitHub Releases) are sanctioned distribution
channels; see [COMMERCIAL.md](./COMMERCIAL.md) and
[TRADEMARKS.md](./TRADEMARKS.md).

> The legal files are initial project terms that have not been reviewed
> by a lawyer. Obtain professional legal review before relying on them
> for commercial use.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md),
[CONTRIBUTION_PERMISSION.md](./CONTRIBUTION_PERMISSION.md), and
[CONTRIBUTOR_TERMS.md](./CONTRIBUTOR_TERMS.md) before opening a pull
request.
