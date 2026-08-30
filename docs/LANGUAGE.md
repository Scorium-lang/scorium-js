# The Scorium Language

Scorium is a readable, programmable configuration language. It keeps
ordinary configuration declarative while allowing expressions, conditions,
loops, and functions when static data is not enough.

> Simple configuration for beginners. Programmable configuration for
> advanced users.

This guide describes stable Scorium language version `0.2.0`, which
`scorium-js` implements natively in TypeScript. The normative definition is
maintained by the separate `scorium-spec` project; this guide is the
approachable introduction.

```scor
server {
    port = 8080
    timeout = 5s
    enabled = true
}
```

An advanced user can add logic without changing formats:

```scor
@base_port = 8000

for i = 1, 3 do
    server {
        port = base_port + i
        name = node-$i
    }
end
```

## Contents

1. [Nodes and leaves](#1-nodes-and-leaves)
2. [Values](#2-values)
3. [Variables](#3-variables)
4. [Expressions](#4-expressions)
5. [Conditions](#5-conditions)
6. [Loops](#6-loops)
7. [Functions](#7-functions)
8. [Includes](#8-includes)
9. [Scripts](#9-scripts)
10. [Host APIs](#10-host-apis)
11. [Comments and formatting](#11-comments-and-formatting)
12. [Security limitations](#12-security-limitations)

## 1. Nodes and leaves

A Scorium file is an ordered list of items. The two basic items are nodes
and leaves.

A **leaf** assigns a typed value to a key:

```scor
port = 8080
enabled = true
name = example
```

A **node** groups configuration under a name:

```scor
database {
    host = localhost
    port = 5432
}
```

Nodes can nest and may carry one optional header:

```scor
server "primary" {
    tls {
        enabled = true
    }
}
```

The host application decides what a node name, header, or leaf means.
Scorium preserves their order rather than turning them into a JavaScript
object, because names and keys may repeat.

## 2. Values

| Type | Example | JavaScript representation |
| --- | --- | --- |
| Integer | `8080` | `{ kind: "int", value: 8080n }` |
| Float | `1.5` | `{ kind: "float", value: 1.5 }` |
| Boolean | `true`, `false` | `{ kind: "bool", value: true }` |
| Nil | `nil` | `{ kind: "nil" }` |
| String | `localhost`, `"hello world"` | `{ kind: "string", value: "..." }` |
| List | `[one, 2, true]` | `{ kind: "list", value: [...] }` |
| Color | `#8EDDFF`, `#101820CC` | RGBA byte channels |
| Duration | `600ms`, `1.5s`, `2m` | Numeric amount plus unit |

Integers are signed 64-bit language values. `scorium-js` uses JavaScript
`bigint`, not `number`, so the complete range is represented exactly.

### Bare and quoted strings

A single unquoted token is normally a string, which keeps ordinary
configuration uncluttered:

```scor
shell = zsh
key = SUPER+Return
certificate = cert.pem
```

Use quotes for whitespace or characters that would otherwise be syntax:

```scor
path = "$HOME/example"
greeting = "hello world"
```

Quoted strings are literal. `$name` interpolation happens only in bare
strings, so the quoted `"$HOME/example"` above is not expanded.

Colors and durations are typed values, not special strings. That makes color
methods deterministic and lets hosts consume duration amounts without
guessing their units. The language does not currently define duration
arithmetic.

## 3. Variables

Three forms cover variable use:

| Where | Form | Meaning |
| --- | --- | --- |
| Definition | `@name = value` | Defines a variable; `@` appears only here. |
| Bare string | `$name` | Interpolates its printable value. |
| Expression | `name` | References its typed value. |

```scor
@mod = SUPER
@base = 8

binding = $mod+Return
gaps = base * 2
```

Definitions become visible after their declaration. An undefined `$name`
is an error. `@name` and `$name` are errors when used as expression
operands; use plain `name` there.

A `local` creates a block-scoped, reassignable binding:

```scor
local i = 0
i = i + 1
```

The second line updates the existing local instead of emitting a leaf.
Function parameters and loop variables are not reassignable this way.

## 4. Expressions

Expressions appear after `=`, in conditions and loop ranges, and in
function arguments and return values.

| Category | Operators |
| --- | --- |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `~=`, `<`, `>`, `<=`, `>=` |
| Boolean | `and`, `or`, `not` |

Binary operators require spaces on both sides. `base*2` is rejected with
`scorium::lex::squeezed_operator`; write `base * 2`.

`and` and `or` return one of their operands. Everything except `nil` and
`false` is truthy.

### Calls, methods, and identifier resolution

```scor
size = double(base)
terminal = select(kitty, alacritty, foot)
deep = primary.darken(0.25)
```

A bare identifier resolves in this order:

1. lexical local, parameter, or loop variable;
2. an `@` variable;
3. an earlier sibling leaf in the same node body;
4. a host-registered value;
5. otherwise, a literal string.

The final fallback is why unquoted arguments such as `kitty` work. An
undefined interpolation has no fallback.

Colors provide `darken(amount)`, `lighten(amount)`, and `alpha(amount)`.
Amounts outside `0.0` through `1.0` are clamped to that range.

## 5. Conditions

```scor
if environment == production then
    workers = 8
elseif environment == staging then
    workers = 4
else
    workers = 2
end
```

Every conditional closes with `end`. Each branch has its own local scope.

## 6. Loops

Numeric `for` ranges are inclusive:

```scor
for i = 1, 3 do
    worker {
        name = worker-$i
        index = i
    }
end
```

An optional third expression sets the step. A zero step is an error.

```scor
for i = 10, 0, -2 do
    value = i
end
```

`while` repeats while its condition is truthy:

```scor
local i = 0
while i < 3 do
    item = i
    i = i + 1
end
```

The evaluator bounds the total `for` and `while` iterations in one
evaluation. The default is 1,000,000 and hosts can lower it.

## 7. Functions

Scorium functions contain ordinary Scorium items:

```scor
fn service(name, port) {
    server {
        id = $name
        port = port
    }
}

service(web, 8080)
service(db, 5432)
```

`return` exits a function and may return a value:

```scor
fn double(x) {
    return x * 2
}

total = double(5)
```

Using `return` when no Scorium function is active raises
`scorium::eval::return_outside_function`. A return inside nested control flow
or a node body still exits the surrounding function.

Function-call depth is bounded. The default maximum is 256 nested calls.

## 8. Includes

```scor
include "theme.scor"
```

Relative paths resolve from the including file's directory. Includes share
the evaluation environment, cycles are rejected, and the host may disable
includes. By default, absolute paths, `..` traversal, and symlink escapes
outside the include root are denied.

When calling `evaluate` directly, set `baseDir` to the directory containing
the original source file.

## 9. Scripts

`script { }` contains raw Lua and is preserved byte-for-byte by the parser
and formatter:

```scor
script {
    local total = 0
}
```

**`scorium-js` does not execute script blocks.** It embeds no Lua VM.
Evaluating a document that contains one throws
`scorium::eval::script_error`; it is never ignored or treated as a no-op.
The Rust implementation supports sandboxed execution. The portability
requirements remain a draft decision in `scorium-spec` section 7.

## 10. Host APIs

Most hosts only inspect the evaluated node/leaf tree. A host may also pass
values and pure functions to `evaluate`:

```ts
import { evaluate, parse, type Value } from "scorium";

const result = evaluate(parse("choice = pick(primary, fallback)"), {
  hostValues: {
    primary: { kind: "string", value: "kitty" },
  },
  hostFunctions: {
    pick(args: Value[]): Value {
      return args[0] ?? { kind: "nil" };
    },
  },
});
```

Registration is per evaluation and does not mutate global state. Treat each
registered function as a capability granted to the configuration. See
[EMBEDDING.md](./EMBEDDING.md) for the TypeScript API.

## 11. Comments and formatting

Scorium accepts `#` and `--` line comments plus `--[[ ]]` block comments:

```scor
# a comment
port = 8080 -- another comment
--[[ a block comment ]]
```

The canonical formatter uses four spaces by default, normalizes line
comments to `#`, and always ends non-empty output with one newline. It
preserves item-leading comments, one same-line trailing comment, and raw
script bodies. Comments inside an expression, list, or call are not attached
to the AST and may be dropped during formatting.

## 12. Security limitations

`scorium-js` executes no arbitrary JavaScript or Lua from configuration.
It enforces loop and call-depth budgets and mediates filesystem access for
`include`. A host function can still perform anything its JavaScript code
permits, so expose only deliberate capabilities. See
[SECURITY.md](./SECURITY.md) for the complete implementation threat model.
