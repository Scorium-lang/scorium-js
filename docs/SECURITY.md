# Security Model

`scorium-js` is designed to evaluate configuration from sources trusted
enough to configure an application but not trusted to execute arbitrary
JavaScript, Lua, commands, or native code.

## Threat model

On its own, a `.scor` document must not be able to:

- spawn a process or execute a command;
- open a network connection;
- read environment variables or application secrets;
- load JavaScript, Lua, native modules, or packages;
- escape the allowed include root;
- consume unbounded loop iterations or recursive function calls.

Anything beyond configuration is a capability the host grants explicitly.

## No script execution

The parser recognizes `script { }` so documents can be inspected and
formatted consistently, but the evaluator always reports
`scorium::eval::script_error`. This package embeds no Lua VM and never
evaluates a script body as JavaScript.

## Resource limits

| Limit | Default | Option |
| --- | --- | --- |
| Total `for`/`while` iterations per evaluation | 1,000,000 | `sandbox.maxLoopIterations` |
| Nested Scorium function calls | 256 | `sandbox.maxFunctionCallDepth` |

Both budgets span the whole evaluation. Hosts processing untrusted input
should lower them according to their workload and should also set an input
size limit before calling `parse`; the package does not impose one.

## Includes

The default include policy is:

- includes enabled;
- absolute paths denied;
- textual `..` parent traversal denied;
- symlink-resolved targets outside `baseDir` denied;
- cycles always detected.

Set `includePolicy.enabled` to `false` when untrusted configuration does not
need filesystem composition. Always pass an intentional `baseDir`; otherwise
it defaults to the process working directory.

Includes necessarily grant read access to files inside the allowed root.
Keep secrets outside that tree.

## Host responsibility

The evaluator itself performs no application action. A host function can:

```ts
evaluate(document, {
  hostFunctions: {
    shell: () => {
      // A function implemented like this would grant command execution.
      throw new Error("do not expose this to untrusted configuration");
    },
  },
});
```

The sandbox cannot restrict arbitrary JavaScript written by the host. Treat
every registered function and value as an explicit capability:

- prefer pure functions;
- validate types, ranges, and argument counts;
- avoid passing secrets as host values;
- do not expose process, network, or unrestricted filesystem operations;
- evaluate truly untrusted input in a disposable worker or process with an
  outer time and memory limit.

## Package and dependency surface

The published runtime has no npm dependencies and contains compiled
JavaScript plus declarations from this repository. Development tooling is
not imported by the package at runtime. Consumers should still pin and
review package updates according to their own supply-chain policy.

## Reporting vulnerabilities

See the root [SECURITY.md](../SECURITY.md). Do not open a public issue for a
suspected vulnerability; use a private GitHub Security Advisory or contact
the maintainer privately.
