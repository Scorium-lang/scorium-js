# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in scorium-js,
**do not open a public issue**. Report it privately to me at @fi3w0 --
open a private GitHub Security Advisory on the repository, or reach me
directly on GitHub (https://github.com/Fi3w0).

Please include:

- A description of the issue and its impact.
- The smallest reproduction you can manage.
- The scorium-js version or commit you tested against.
- Any fix you have considered.

We will acknowledge receipt as soon as we can and aim to keep reporters
informed through to a fix.

## Scope

scorium-js has **no `script { }` execution** -- there is no embedded Lua
VM, so a `script { }` block parses and formats correctly but raises a
clear `scorium::eval::script_error` on evaluation rather than running
anything. That means, unlike `scorium-rust`, there is currently no Lua
sandbox surface to attack: the entire threat model today is the native
(non-Lua) language core plus its own resource limits.

- Loop execution is bounded by `EvalOptions.sandbox.maxLoopIterations`
  (default 1,000,000), a single budget shared across one whole evaluation.
- Function-call recursion is bounded by
  `EvalOptions.sandbox.maxFunctionCallDepth` (default 256).
- `include` obeys the host's `IncludePolicy`: cycle detection, a default
  ban on `..` parent traversal and absolute paths, and containment checked
  on the *canonicalized* (symlink-resolved) path, not just the textual one
  -- a relative, `..`-free path can still escape a sandboxed root through a
  symlink.

In scope for this policy:

- Any way a `.scor` file can escape the sandbox -- reading or writing
  files outside the include root, spawning processes, opening network
  connections, reading secret environment variables, or hitting unbounded
  resource use.
- Uncaught exceptions, crashes, or infinite loops reachable from parsing
  or evaluating untrusted input that this package's own API doesn't
  already document as possible.
- Bypass of the loop-iteration or call-depth budgets.
- Include path-traversal, symlink-escape, or cycle-detection bypass.

Out of scope:

- Issues that require the host application to have already registered a
  dangerous host function via `EvalOptions.hostFunctions`/`hostValues`.
  The host owns what it exposes; that is the host's security decision, not
  scorium-js's.
- Denial of service that requires running a `.scor` file the operator
  already trusts.
- Anything specific to `script { }`/Lua execution -- there is nothing
  there to attack yet. Once a Lua VM lands (contingent on `scorium-spec`
  §7), this document needs a real threat model for it, matching
  `scorium-rust`'s.

## Supported versions

scorium-js is pre-1.0. Security fixes go onto the latest `main`. There are
no backport branches yet.

## Hardening guidance for hosts

- Start from the default `EvalOptions` and tighten, not from open.
- Register host functions and values that are themselves side-effect-free
  or clearly safe; treat every registered function as a capability you are
  granting the config file.
- If you accept untrusted configuration, keep the default `IncludePolicy`
  (cycle detection on, parent traversal off) and consider disabling
  `include` entirely with `{ includePolicy: { enabled: false } }`.
- Evaluate untrusted input in a process you would be willing to crash.

See [docs/SECURITY.md](./docs/SECURITY.md) for the detailed evaluator,
include, host-capability, and package threat model.

---

**Legal notice.** This policy states initial project terms and
operational guidance. It has not been reviewed by a lawyer and is not a
warranty of any level of security.
