import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { BinOp, Document, Expr, FnDef, Item, UnOp } from "./ast.ts";
import type { Entry } from "./entry.ts";
import { EvalError, ScoriumError } from "./errors.ts";
import { parse } from "./parser.ts";
import type { SourceFile, SourceSpan } from "./source.ts";
import { makeInt, type Value } from "./value.ts";

export { EvalError };

/** `include` behavior (scorium-spec §6). Matches scorium-rust's `IncludePolicy` defaults. */
export interface IncludePolicy {
  enabled: boolean;
  allowParentTraversal: boolean;
}

/**
 * The result of resolving one `include "path"` against a base: a
 * canonical `key` identifying the target (used for cycle detection and
 * as the `include` entry's resolved path) and the `base` that nested
 * includes found inside it should resolve against next. For the
 * built-in filesystem resolution these are the resolved file's path and
 * its containing directory, respectively -- a custom resolver is free
 * to give both any meaning suited to its own address space.
 */
export interface ResolvedInclude {
  key: string;
  base: string;
}

/**
 * A host-supplied alternative to filesystem-backed `include "..."`
 * resolution, for content that isn't (only) on local disk -- content
 * addressed by URL, stored in a database, or held as unsaved editor
 * buffers. Overrides `IncludePolicy`'s containment/traversal checks
 * entirely: a custom resolver owns its own path-safety policy. Throw to
 * signal failure: `resolve` throwing raises
 * `scorium::eval::include_path_denied`, `load` throwing raises
 * `scorium::eval::include_io`.
 *
 * When `EvalOptions.includeResolver` is unset (the default), `include`
 * resolves against the local filesystem exactly as it always has,
 * honoring `IncludePolicy`.
 */
export interface IncludeResolver {
  resolve(base: string, path: string): ResolvedInclude;
  load(key: string): string;
}

/**
 * Required-but-defaults-open resource limits (scorium-spec §3/§6):
 * existence, configurability, and the error path are normative; these
 * default values are scorium-rust's own, not independently justified.
 * Script instruction/memory limits aren't included -- no Lua VM is
 * embedded, so they don't apply yet.
 */
export interface SandboxOptions {
  maxLoopIterations: number;
  maxFunctionCallDepth: number;
}
const DEFAULT_SANDBOX: SandboxOptions = { maxLoopIterations: 1_000_000, maxFunctionCallDepth: 256 };

/**
 * A host function reachable from expressions (`f(a, b)`) exactly like a
 * Scorium `fn` -- "one registry, multiple surfaces" (scorium-spec §6).
 * A user-defined `fn` of the same name takes priority (matches
 * scorium-rust: it checks its own `functions` map before falling back
 * to the host registry). Throwing inside one is wrapped as
 * `scorium::eval::type_error`, matching scorium-rust's
 * `Result<Value, String>` host-function contract.
 */
export type HostFunction = (args: Value[]) => Value;

export interface EvalOptions {
  /** Directory relative `include "..."` paths resolve from. Defaults to the current working directory, matching a source with no file of its own. */
  baseDir?: string;
  includePolicy?: Partial<IncludePolicy>;
  /** Overrides filesystem-backed `include` resolution when set. See `IncludeResolver`. */
  includeResolver?: IncludeResolver;
  sandbox?: Partial<SandboxOptions>;
  /** Reachable via `f(args)` calls -- identifier-resolution step 4 is host *values*, not functions; see `hostValues`. */
  hostFunctions?: Record<string, HostFunction>;
  /** Identifier resolution step 4 (scorium-spec §1): reachable as a plain identifier in expressions, after locals/`@`-vars/sibling-leaves and before the fallback-to-string. */
  hostValues?: Record<string, Value>;
}

const I64_MIN_AS_F64 = -9223372036854775808.0;
const I64_MAX_PLUS_ONE_AS_F64 = 9223372036854775808.0;
const NIL: Value = { kind: "nil" };

/**
 * A lexical binding. `reassignable` distinguishes a genuine `local`
 * declaration (updatable via a later `name = expr` leaf, scorium-spec
 * §1 "Reassignment") from a function parameter or `for`-loop variable,
 * which is NOT reassignable this way -- confirmed by scorium-rust's own
 * test: a leaf named the same as a fn parameter still emits a leaf, it
 * doesn't silently vanish into a no-op self-reassignment.
 */
interface Binding {
  value: Value;
  reassignable: boolean;
}
type Frame = Map<string, Binding>;

interface EvalCtx {
  source: SourceFile;
  /** `@`-variables: one flat scope, global to the whole evaluation, never reassignable. */
  atVars: Map<string, Value>;
  /** Locals/params/loop-vars: a stack of block scopes, innermost last. */
  locals: Frame[];
  /** `fn` definitions: one flat scope (scorium-rust's own model is flat too). */
  functions: Map<string, FnDef>;
  hostFunctions: Map<string, HostFunction>;
  /** Identifier resolution step 4 (scorium-spec §1). */
  hostValues: Map<string, Value>;
  /** Where node/leaf/include entries produced right now are appended -- shared across nested control flow, swapped only when entering a node body. */
  sink: Entry[];
  /** Where relative `include` paths resolve from -- changes to the included file's own directory inside its evaluation (scorium-rust does the same). */
  baseDir: string;
  includePolicy: IncludePolicy;
  includeResolver?: IncludeResolver;
  /** Canonical paths of includes currently in progress, for cycle detection (scorium-spec §3). */
  includeStack: string[];
  maxLoopIterations: number;
  maxFunctionCallDepth: number;
  /**
   * Mutable sandbox counters. A plain object, not top-level EvalCtx
   * fields, so it stays shared by reference through every `{...ctx,
   * sink: ... }` copy (node bodies, includes) -- the loop budget is
   * one counter across the *whole* evaluation (scorium-spec §3), not
   * per-scope.
   */
  budget: { loopIterationsUsed: number; callDepth: number };
}

type Flow = { kind: "normal" } | { kind: "return"; value: Value; span?: SourceSpan };
const NORMAL: Flow = { kind: "normal" };

/**
 * Evaluates the full language core (scorium-spec §1-3, §6) except
 * `script {}` -- see README.md "Current scope".
 */
export function evaluate(doc: Document, options: EvalOptions = {}): Entry[] {
  const sandbox = { ...DEFAULT_SANDBOX, ...options.sandbox };
  const ctx: EvalCtx = {
    source: doc.source ?? { name: "<input>", text: "" },
    atVars: new Map(),
    locals: [new Map()],
    functions: new Map(),
    hostFunctions: new Map(Object.entries(options.hostFunctions ?? {})),
    hostValues: new Map(Object.entries(options.hostValues ?? {})),
    sink: [],
    baseDir: options.baseDir ?? process.cwd(),
    includePolicy: { enabled: true, allowParentTraversal: false, ...options.includePolicy },
    includeResolver: options.includeResolver,
    includeStack: [],
    maxLoopIterations: sandbox.maxLoopIterations,
    maxFunctionCallDepth: sandbox.maxFunctionCallDepth,
    budget: { loopIterationsUsed: 0, callDepth: 0 },
  };
  const flow = evalItems(doc.items, ctx);
  if (flow.kind === "return") {
    throw new EvalError("scorium::eval::return_outside_function: `return` is only valid inside a Scorium function", {
      source: ctx.source,
      span: flow.span ?? { start: 0, end: 1 },
    });
  }
  return ctx.sink;
}

function evalItems(items: Item[], ctx: EvalCtx): Flow {
  for (const item of items) {
    const flow = evalItem(item, ctx);
    if (flow.kind === "return") return flow;
  }
  return NORMAL;
}

/** Runs `body` with a fresh, popped-after block scope (node bodies, if/while bodies) -- so a `local` declared inside doesn't leak to siblings evaluated afterward. */
function evalBlockScoped(body: Item[], ctx: EvalCtx): Flow {
  ctx.locals.push(new Map());
  const flow = evalItems(body, ctx);
  ctx.locals.pop();
  return flow;
}

function currentFrame(ctx: EvalCtx): Frame {
  return ctx.locals[ctx.locals.length - 1]!;
}

function resolveLocal(ctx: EvalCtx, name: string): Value | undefined {
  for (let idx = ctx.locals.length - 1; idx >= 0; idx--) {
    const binding = ctx.locals[idx]!.get(name);
    if (binding) return binding.value;
  }
  return undefined;
}

/** §1 resolution step 3: a leaf emitted earlier in the *same* body (ctx.sink is swapped per node body, so this never reaches into an enclosing/ancestor body). Most recent match wins if a key repeats. */
function resolveSiblingLeaf(ctx: EvalCtx, name: string): Value | undefined {
  for (let idx = ctx.sink.length - 1; idx >= 0; idx--) {
    const entry = ctx.sink[idx]!;
    if (entry.kind === "leaf" && entry.key === name) return entry.value;
  }
  return undefined;
}

/** Whether `name` resolves to anything bindable (steps 1-4 of §1). Used to decide the uncalled-member fallback-to-string rule. */
function isBound(ctx: EvalCtx, name: string): boolean {
  return (
    resolveLocal(ctx, name) !== undefined ||
    ctx.atVars.get(name) !== undefined ||
    resolveSiblingLeaf(ctx, name) !== undefined ||
    ctx.hostValues.get(name) !== undefined
  );
}

/** §1's leaf-reassignment rule: only a `local` binding is updated in place; a param/loop-var binding of the same name is NOT reassigned (the leaf still emits). Stops at the first (innermost) match either way -- lexical shadowing. */
function setLocalIfExists(ctx: EvalCtx, name: string, value: Value): boolean {
  for (let idx = ctx.locals.length - 1; idx >= 0; idx--) {
    const binding = ctx.locals[idx]!.get(name);
    if (binding) {
      if (!binding.reassignable) return false;
      binding.value = value;
      return true;
    }
  }
  return false;
}

function evalItem(item: Item, ctx: EvalCtx): Flow {
  try {
    return evalItemInner(item, ctx);
  } catch (error) {
    if (error instanceof ScoriumError && item.span) {
      error.attachContext({ source: ctx.source, span: item.span });
    }
    throw error;
  }
}

function evalItemInner(item: Item, ctx: EvalCtx): Flow {
  switch (item.type) {
    case "vardef":
      ctx.atVars.set(item.name, evalExpr(item.value, ctx));
      return NORMAL;
    case "local":
      currentFrame(ctx).set(item.name, { value: evalExpr(item.value, ctx), reassignable: true });
      return NORMAL;
    case "leaf": {
      const value = evalExpr(item.value, ctx);
      if (!setLocalIfExists(ctx, item.key, value)) {
        ctx.sink.push({ kind: "leaf", key: item.key, value, span: item.span });
      }
      return NORMAL;
    }
    case "node": {
      const header = item.header === null ? null : item.header.text;
      const children: Entry[] = [];
      const flow = evalBlockScoped(item.body, { ...ctx, sink: children });
      if (flow.kind === "return") return flow;
      ctx.sink.push({ kind: "node", name: item.name, header, children, span: item.span });
      return NORMAL;
    }
    case "fndef":
      ctx.functions.set(item.name, item);
      return NORMAL;
    case "script":
      // Explicit-error requirement (scorium-spec §1/§5): a build that
      // doesn't embed Lua must raise a clear diagnostic on script{},
      // never silently skip it or treat the body as a no-op.
      throw new EvalError("scorium::eval::script_error: script {} execution is not implemented in scorium-js (no Lua VM embedded; see scorium-spec §7, still unapproved)");
    case "include": {
      const pathVal = evalExpr(item.path, ctx);
      if (pathVal.kind !== "string") {
        throw new EvalError(`scorium::eval::type_error: an include path must be a string, found ${pathVal.kind}`);
      }
      return execInclude(pathVal.value, ctx, item.span);
    }
    case "exprstmt":
      execCallStmt(item.expr, item.span, ctx);
      return NORMAL;
    case "if": {
      for (const branch of [{ cond: item.cond, body: item.thenBody }, ...item.elifs]) {
        if (isTruthy(evalExpr(branch.cond, ctx))) return evalBlockScoped(branch.body, ctx);
      }
      if (item.elseBody) return evalBlockScoped(item.elseBody, ctx);
      return NORMAL;
    }
    case "for": {
      const startN = requireNumber(evalExpr(item.start, ctx));
      const stopN = requireNumber(evalExpr(item.stop, ctx));
      const stepN = item.step ? requireNumber(evalExpr(item.step, ctx)) : 1;
      if (stepN === 0) throw new EvalError("scorium::eval::type_error: a `for` step of 0 is invalid");
      for (let i = startN; stepN > 0 ? i <= stopN : i >= stopN; i += stepN) {
        checkLoopBudget(ctx);
        const loopVal: Value = Number.isInteger(i) ? makeInt(BigInt(i)) : { kind: "float", value: i };
        ctx.locals.push(new Map([[item.varName, { value: loopVal, reassignable: false }]]));
        const flow = evalItems(item.body, ctx);
        ctx.locals.pop();
        if (flow.kind === "return") return flow;
      }
      return NORMAL;
    }
    case "while": {
      while (isTruthy(evalExpr(item.cond, ctx))) {
        checkLoopBudget(ctx);
        const flow = evalBlockScoped(item.body, ctx);
        if (flow.kind === "return") return flow;
      }
      return NORMAL;
    }
    case "return":
      return { kind: "return", value: item.value ? evalExpr(item.value, ctx) : NIL, span: item.span };
  }
}

/**
 * A standalone call statement (always a `Call` expression -- the parser
 * doesn't accept any other shape at statement position). Matches
 * scorium-rust's `exec_call_stmt`: a call to a *host* function (not a
 * Scorium `fn`) emits a `hostCall` entry recording its name, arguments,
 * and result; anything else (a Scorium `fn` call, whose body already
 * emits its own entries) is just evaluated for its side effect.
 */
function execCallStmt(expr: Expr, span: SourceSpan | undefined, ctx: EvalCtx): void {
  if (expr.type === "call" && expr.callee.type === "ident" && !ctx.functions.has(expr.callee.name)) {
    const hostFn = ctx.hostFunctions.get(expr.callee.name);
    if (hostFn) {
      const args = expr.args.map((a) => evalExpr(a, ctx));
      let result: Value;
      try {
        result = hostFn(args);
      } catch (err) {
        throw new EvalError(`scorium::eval::type_error: ${err instanceof Error ? err.message : String(err)}`);
      }
      ctx.sink.push({ kind: "hostCall", name: expr.callee.name, args, result, span });
      return;
    }
  }
  evalExpr(expr, ctx); // side effect only: any entries the callee's body produces land in ctx.sink
}

/**
 * Path containment (scorium-spec §6): reject a textual `..`/absolute
 * path outright, then -- independently, since a purely relative path
 * can still escape through a symlink -- canonicalize both the include
 * root and the resolved target and require containment. If either
 * canonicalization fails (e.g. the target doesn't exist yet), skip the
 * containment check and let the later read fail with `include_io`
 * instead -- matches scorium-rust's own fallback exactly.
 */
function checkIncludePath(pathStr: string, ctx: EvalCtx): string {
  if (!ctx.includePolicy.enabled) {
    throw new EvalError("scorium::eval::includes_disabled: `include` is disabled by the host application");
  }
  const hasParentTraversal = pathStr.split(/[\\/]/).includes("..");
  if (!ctx.includePolicy.allowParentTraversal && (isAbsolute(pathStr) || hasParentTraversal)) {
    throw new EvalError(`scorium::eval::include_path_denied: include path \`${pathStr}\` is not allowed by the host's path policy`);
  }
  const resolved = resolve(ctx.baseDir, pathStr);
  if (!ctx.includePolicy.allowParentTraversal) {
    try {
      const canonicalBase = realpathSync(ctx.baseDir);
      const canonicalTarget = realpathSync(resolved);
      if (canonicalTarget !== canonicalBase && !canonicalTarget.startsWith(canonicalBase + sep)) {
        throw new EvalError(`scorium::eval::include_path_denied: include path \`${pathStr}\` escapes the include root`);
      }
    } catch (err) {
      if (err instanceof EvalError) throw err;
      // realpath failed (target doesn't exist yet, dangling symlink, ...) -- fall through to the read, which will raise include_io.
    }
  }
  return resolved;
}

function execIncludeViaResolver(resolver: IncludeResolver, pathStr: string, ctx: EvalCtx, span?: SourceSpan): Flow {
  if (!ctx.includePolicy.enabled) {
    throw new EvalError("scorium::eval::includes_disabled: `include` is disabled by the host application");
  }
  let resolved: ResolvedInclude;
  try {
    resolved = resolver.resolve(ctx.baseDir, pathStr);
  } catch {
    throw new EvalError(`scorium::eval::include_path_denied: include path \`${pathStr}\` was denied by the host resolver`);
  }
  if (ctx.includeStack.includes(resolved.key)) {
    const chain = [...ctx.includeStack, resolved.key].join(" -> ");
    throw new EvalError(`scorium::eval::include_cycle: include cycle detected: ${chain}`);
  }
  let content: string;
  try {
    content = resolver.load(resolved.key);
  } catch (err) {
    throw new EvalError(`scorium::eval::include_io: failed to read include \`${pathStr}\`: ${(err as Error).message}`);
  }
  let includedDoc: Document;
  try {
    includedDoc = parse(content, { sourceName: resolved.key });
  } catch (err) {
    throw new EvalError(`scorium::eval::include_parse: include \`${pathStr}\` failed to parse: ${(err as Error).message}`);
  }
  ctx.sink.push({ kind: "include", path: pathStr, span });
  const childCtx: EvalCtx = {
    ...ctx,
    source: includedDoc.source ?? { name: resolved.key, text: content },
    baseDir: resolved.base,
    includeStack: [...ctx.includeStack, resolved.key],
  };
  return evalItems(includedDoc.items, childCtx);
}

function execInclude(pathStr: string, ctx: EvalCtx, span?: SourceSpan): Flow {
  if (ctx.includeResolver) {
    return execIncludeViaResolver(ctx.includeResolver, pathStr, ctx, span);
  }
  const resolved = checkIncludePath(pathStr, ctx);
  let canonical: string;
  try {
    canonical = realpathSync(resolved);
  } catch {
    canonical = resolved;
  }
  if (ctx.includeStack.includes(canonical)) {
    const chain = [...ctx.includeStack, canonical].join(" -> ");
    throw new EvalError(`scorium::eval::include_cycle: include cycle detected: ${chain}`);
  }
  let content: string;
  try {
    content = readFileSync(resolved, "utf8");
  } catch (err) {
    throw new EvalError(`scorium::eval::include_io: failed to read include \`${pathStr}\`: ${(err as Error).message}`);
  }
  let includedDoc: Document;
  try {
    includedDoc = parse(content, { sourceName: resolved });
  } catch (err) {
    throw new EvalError(`scorium::eval::include_parse: include \`${pathStr}\` failed to parse: ${(err as Error).message}`);
  }
  ctx.sink.push({ kind: "include", path: pathStr, span });
  const childCtx: EvalCtx = {
    ...ctx,
    source: includedDoc.source ?? { name: resolved, text: content },
    baseDir: dirname(resolved),
    includeStack: [...ctx.includeStack, canonical],
  };
  // Shares sink/variables/functions by reference and propagates `return`
  // through an include reached from a Scorium function.
  return evalItems(includedDoc.items, childCtx);
}

/** Total for/while iterations allowed across one whole evaluation (scorium-spec §3), not per-loop. */
function checkLoopBudget(ctx: EvalCtx): void {
  ctx.budget.loopIterationsUsed++;
  if (ctx.budget.loopIterationsUsed > ctx.maxLoopIterations) {
    throw new EvalError(
      `scorium::eval::loop_budget_exceeded: loop budget exceeded (${ctx.maxLoopIterations} iterations); this program may not terminate`,
    );
  }
}

function requireNumber(v: Value): number {
  if (v.kind === "int") return Number(v.value);
  if (v.kind === "float") return v.value;
  throw new EvalError(`scorium::eval::type_error: expected a number, found ${v.kind}`);
}

function evalExpr(expr: Expr, ctx: EvalCtx): Value {
  switch (expr.type) {
    case "int":
      return makeInt(expr.value);
    case "float":
      return { kind: "float", value: expr.value };
    case "bool":
      return { kind: "bool", value: expr.value };
    case "nil":
      return NIL;
    case "str":
      if (expr.lit.kind === "quoted") return { kind: "string", value: expr.lit.text };
      return { kind: "string", value: evalBareParts(expr.lit.parts, ctx) };
    case "color":
      return parseColor(expr.hex);
    case "duration":
      if (expr.unit !== "ms" && expr.unit !== "s" && expr.unit !== "m") {
        throw new EvalError(`scorium::eval::type_error: unknown duration unit ${expr.unit}`);
      }
      return { kind: "duration", amount: expr.amount, unit: expr.unit };
    case "list":
      return { kind: "list", value: expr.items.map((e) => evalExpr(e, ctx)) };
    case "ident": {
      // §1 resolution, all five steps: local/param/loop-var,
      // @-variable, sibling leaf, host value, fallback to a literal
      // string.
      const local = resolveLocal(ctx, expr.name);
      if (local !== undefined) return local;
      const at = ctx.atVars.get(expr.name);
      if (at !== undefined) return at;
      const sibling = resolveSiblingLeaf(ctx, expr.name);
      if (sibling !== undefined) return sibling;
      const host = ctx.hostValues.get(expr.name);
      if (host !== undefined) return host;
      return { kind: "string", value: expr.name };
    }
    case "unary":
      return evalUnary(expr.op, evalExpr(expr.operand, ctx));
    case "binary":
      return evalBinary(expr.op, expr.left, expr.right, ctx);
    case "member":
      return evalMember(expr.base, expr.field, ctx);
    case "call":
      return evalCall(expr.callee, expr.args, ctx);
  }
}

/**
 * `base.field`, uncalled. §1: if `base` isn't a real binding, the whole
 * `base.field` was always just a literal string (this is how dotted
 * bare strings like `cert.pem` work). If `base` *is* a real binding,
 * bare field access still isn't supported -- only a call
 * (`.field(...)`) is; see evalCall's member-callee branch.
 */
function evalMember(base: Expr, field: string, ctx: EvalCtx): Value {
  if (base.type === "ident" && !isBound(ctx, base.name)) {
    return { kind: "string", value: `${base.name}.${field}` };
  }
  const baseVal = evalExpr(base, ctx);
  throw new EvalError(
    `scorium::eval::type_error: ${baseVal.kind} has no field \`${field}\` (only method calls like \`.${field}(...)\` are supported)`,
  );
}

function evalCall(callee: Expr, argExprs: Expr[], ctx: EvalCtx): Value {
  if (callee.type === "member") {
    const baseVal = evalExpr(callee.base, ctx);
    const argValues = argExprs.map((a) => evalExpr(a, ctx));
    return callMethod(baseVal, callee.field, argValues);
  }
  if (callee.type !== "ident") {
    throw new EvalError("scorium::eval::type_error: this expression is not callable");
  }
  const fn = ctx.functions.get(callee.name);
  if (!fn) {
    // A Scorium `fn` of the same name takes priority over a host
    // function -- matches scorium-rust checking its own `functions`
    // map first, falling back to the host registry.
    const hostFn = ctx.hostFunctions.get(callee.name);
    if (hostFn) {
      const argValues = argExprs.map((a) => evalExpr(a, ctx));
      try {
        return hostFn(argValues);
      } catch (err) {
        throw new EvalError(`scorium::eval::type_error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new EvalError(`scorium::eval::unknown_function: unknown function \`${callee.name}\``);
  }
  const argValues = argExprs.map((a) => evalExpr(a, ctx));
  const frame: Frame = new Map();
  fn.params.forEach((p, i) => frame.set(p, { value: argValues[i] ?? NIL, reassignable: false }));

  ctx.budget.callDepth++;
  if (ctx.budget.callDepth > ctx.maxFunctionCallDepth) {
    throw new EvalError(
      `scorium::eval::call_depth_exceeded: function call depth exceeded (${ctx.maxFunctionCallDepth}); this function may recurse forever`,
    );
  }
  ctx.locals.push(frame);
  try {
    // entries the body produces land in the caller's current ctx.sink, same as a for/while body would
    const flow = evalItems(fn.body, ctx);
    return flow.kind === "return" ? flow.value : NIL;
  } finally {
    ctx.locals.pop();
    ctx.budget.callDepth--;
  }
}

const COLOR_METHODS = new Set(["darken", "lighten", "alpha"]);

/** Color's three methods (scorium-spec §2) -- the only value type with methods. */
function callMethod(base: Value, field: string, args: Value[]): Value {
  if (base.kind !== "color") {
    throw new EvalError(`scorium::eval::type_error: ${base.kind} has no method \`${field}\``);
  }
  if (!COLOR_METHODS.has(field)) {
    throw new EvalError(`scorium::eval::type_error: color has no method \`${field}\``);
  }
  if (args.length !== 1) {
    throw new EvalError(`scorium::eval::type_error: color.${field}() expects exactly one numeric argument`);
  }
  const amount = numberOf(args[0]!);
  if (amount === undefined) {
    throw new EvalError(`scorium::eval::type_error: color.${field}() expects a number, found ${args[0]!.kind}`);
  }
  const clamped = Math.min(1, Math.max(0, amount));
  const round = (n: number) => Math.round(n);
  if (field === "darken") {
    const scale = 1 - clamped;
    return { kind: "color", r: round(base.r * scale), g: round(base.g * scale), b: round(base.b * scale), a: base.a };
  }
  if (field === "lighten") {
    const mix = (c: number) => round(c + (255 - c) * clamped);
    return { kind: "color", r: mix(base.r), g: mix(base.g), b: mix(base.b), a: base.a };
  }
  // alpha
  return { kind: "color", r: base.r, g: base.g, b: base.b, a: round(clamped * 255) };
}

function evalBareParts(parts: Array<{ kind: "lit"; text: string } | { kind: "interp"; name: string }>, ctx: EvalCtx): string {
  let out = "";
  for (const part of parts) {
    if (part.kind === "lit") {
      out += part.text;
      continue;
    }
    const local = resolveLocal(ctx, part.name);
    const bound = local !== undefined ? local : ctx.atVars.get(part.name);
    if (bound === undefined) {
      throw new EvalError(`scorium::eval::undefined_interpolation: \`$${part.name}\` is not defined; define it first with \`@${part.name} = value\``);
    }
    out += displayValue(bound);
  }
  return out;
}

function displayValue(v: Value): string {
  switch (v.kind) {
    case "int":
      return v.value.toString();
    case "float":
      return String(v.value);
    case "bool":
      return String(v.value);
    case "nil":
      return "nil";
    case "string":
      return v.value;
    case "color":
      return v.a !== 255 ? `#${hex(v.r)}${hex(v.g)}${hex(v.b)}${hex(v.a)}` : `#${hex(v.r)}${hex(v.g)}${hex(v.b)}`;
    case "duration":
      return `${v.amount}${v.unit}`;
    case "list":
      return `[${v.value.map(displayValue).join(", ")}]`;
  }
}
function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

function parseColor(hexDigits: string): Value {
  const byte = (s: string) => parseInt(s, 16);
  const r = byte(hexDigits.slice(0, 2));
  const g = byte(hexDigits.slice(2, 4));
  const b = byte(hexDigits.slice(4, 6));
  const a = hexDigits.length === 8 ? byte(hexDigits.slice(6, 8)) : 255;
  return { kind: "color", r, g, b, a };
}

function isTruthy(v: Value): boolean {
  return !(v.kind === "nil" || (v.kind === "bool" && v.value === false));
}

function evalUnary(op: UnOp, v: Value): Value {
  if (op === "not") return { kind: "bool", value: !isTruthy(v) };
  if (v.kind === "int") return makeInt(-v.value);
  if (v.kind === "float") return { kind: "float", value: -v.value };
  throw new EvalError(`scorium::eval::type_error: cannot negate a ${v.kind}`);
}

function evalBinary(op: BinOp, leftExpr: Expr, rightExpr: Expr, ctx: EvalCtx): Value {
  if (op === "and") {
    const l = evalExpr(leftExpr, ctx);
    return isTruthy(l) ? evalExpr(rightExpr, ctx) : l;
  }
  if (op === "or") {
    const l = evalExpr(leftExpr, ctx);
    return isTruthy(l) ? l : evalExpr(rightExpr, ctx);
  }
  const l = evalExpr(leftExpr, ctx);
  const r = evalExpr(rightExpr, ctx);
  if (op === "eq" || op === "noteq") {
    const eq = valuesEqual(l, r);
    return { kind: "bool", value: op === "eq" ? eq : !eq };
  }
  if (op === "lt" || op === "gt" || op === "lte" || op === "gte") {
    return { kind: "bool", value: compare(op, l, r) };
  }
  return arith(op, l, r);
}

function numberOf(v: Value): number | undefined {
  if (v.kind === "int") return Number(v.value);
  if (v.kind === "float") return v.value;
  return undefined;
}

/** Exact Int/Float ordering (scorium-spec §2): never casts the integer to f64 first. Returns undefined for an incomparable pair (NaN). */
function compareIntFloat(i: bigint, f: number): number | undefined {
  if (Number.isNaN(f)) return undefined;
  if (f < I64_MIN_AS_F64) return 1;
  if (f >= I64_MAX_PLUS_ONE_AS_F64) return -1;
  const truncated = BigInt(Math.trunc(f));
  if (i === truncated) {
    const fract = f - Math.trunc(f);
    if (fract > 0) return -1;
    if (fract < 0) return 1;
    return 0;
  }
  return i < truncated ? -1 : 1;
}

function ordering(l: Value, r: Value): number | undefined | "incomparable" {
  if (l.kind === "int" && r.kind === "int") return l.value < r.value ? -1 : l.value > r.value ? 1 : 0;
  if (l.kind === "float" && r.kind === "float") {
    if (Number.isNaN(l.value) || Number.isNaN(r.value)) return undefined;
    return l.value < r.value ? -1 : l.value > r.value ? 1 : 0;
  }
  if (l.kind === "int" && r.kind === "float") return compareIntFloat(l.value, r.value);
  if (l.kind === "float" && r.kind === "int") {
    const o = compareIntFloat(r.value, l.value);
    return o === undefined ? undefined : -o;
  }
  if (l.kind === "string" && r.kind === "string") return l.value < r.value ? -1 : l.value > r.value ? 1 : 0;
  return "incomparable";
}

function compare(op: "lt" | "gt" | "lte" | "gte", l: Value, r: Value): boolean {
  const o = ordering(l, r);
  if (o === "incomparable") {
    throw new EvalError(`scorium::eval::type_error: cannot compare ${l.kind} and ${r.kind}`);
  }
  if (o === undefined) return false; // NaN: every ordered comparison is false
  if (op === "lt") return o < 0;
  if (op === "gt") return o > 0;
  if (op === "lte") return o <= 0;
  return o >= 0;
}

/** Runtime equality per scorium-spec §2: exact for Int/Float pairs, false for other mismatched-type pairs (not an error), NaN unequal to itself. */
function valuesEqual(l: Value, r: Value): boolean {
  if (l.kind === "int" && r.kind === "float") return compareIntFloat(l.value, r.value) === 0;
  if (l.kind === "float" && r.kind === "int") return compareIntFloat(r.value, l.value) === 0;
  if (l.kind !== r.kind) return false;
  switch (l.kind) {
    case "int":
      return l.value === (r as typeof l).value;
    case "float":
      return l.value === (r as typeof l).value;
    case "bool":
      return l.value === (r as typeof l).value;
    case "nil":
      return true;
    case "string":
      return l.value === (r as typeof l).value;
    case "color": {
      const rc = r as typeof l;
      return l.r === rc.r && l.g === rc.g && l.b === rc.b && l.a === rc.a;
    }
    case "duration": {
      const rd = r as typeof l;
      return l.amount === rd.amount && l.unit === rd.unit;
    }
    case "list": {
      const rl = (r as typeof l).value;
      return l.value.length === rl.length && l.value.every((v, i) => valuesEqual(v, rl[i]!));
    }
  }
}

function bigIntEuclidMod(a: bigint, b: bigint): bigint {
  let r = a % b;
  if (r < 0n) r += b < 0n ? -b : b;
  return r;
}
function numberEuclidMod(a: number, b: number): number {
  let r = a % b;
  if (r < 0) r += Math.abs(b);
  return r;
}

function arith(op: "add" | "sub" | "mul" | "div" | "mod", l: Value, r: Value): Value {
  if (l.kind === "int" && r.kind === "int") {
    switch (op) {
      case "add":
        return makeInt(l.value + r.value);
      case "sub":
        return makeInt(l.value - r.value);
      case "mul":
        return makeInt(l.value * r.value);
      case "mod":
        if (r.value === 0n) throw new EvalError("scorium::eval::division_by_zero");
        if (r.value === -1n) return makeInt(0n); // mirrors scorium-rust: avoids the i64::MIN / -1 overflow case
        return makeInt(bigIntEuclidMod(l.value, r.value));
      case "div":
        if (r.value === 0n) throw new EvalError("scorium::eval::division_by_zero");
        return { kind: "float", value: Number(l.value) / Number(r.value) };
    }
  }
  const ln = numberOf(l);
  const rn = numberOf(r);
  if (ln !== undefined && rn !== undefined) {
    switch (op) {
      case "add":
        return { kind: "float", value: ln + rn };
      case "sub":
        return { kind: "float", value: ln - rn };
      case "mul":
        return { kind: "float", value: ln * rn };
      case "div":
        if (rn === 0) throw new EvalError("scorium::eval::division_by_zero");
        return { kind: "float", value: ln / rn };
      case "mod":
        if (rn === 0) throw new EvalError("scorium::eval::division_by_zero");
        return { kind: "float", value: numberEuclidMod(ln, rn) };
    }
  }
  throw new EvalError(`scorium::eval::type_error: cannot apply arithmetic to ${l.kind} and ${r.kind}`);
}
