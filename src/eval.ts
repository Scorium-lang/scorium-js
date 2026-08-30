import type { Document, Expr, Item } from "./ast.ts";
import type { Entry } from "./entry.ts";
import { makeInt, type Value } from "./value.ts";

export class EvalError extends Error {}

const I64_MIN_AS_F64 = -9223372036854775808.0;
const I64_MAX_PLUS_ONE_AS_F64 = 9223372036854775808.0;

/** A flat variable scope: `@`-definitions visible to later items in the same or an enclosing scope (scorium-spec §3). */
type Scope = Map<string, Value>;

/**
 * Evaluates variables + full expressions on top of the declarative
 * subset (scorium-spec §1-3). Identifier resolution implements only
 * steps 2 (`@`-variable) and 5 (fallback to a literal string) of the
 * 5-step order -- steps 1/3/4 (locals, sibling leaves, host values)
 * need features this build doesn't have yet. See README.md.
 */
export function evaluate(doc: Document): Entry[] {
  const scope: Scope = new Map();
  return evalItems(doc.items, scope);
}

function evalItems(items: Item[], scope: Scope): Entry[] {
  const entries: Entry[] = [];
  for (const item of items) {
    const entry = evalItem(item, scope);
    if (entry) entries.push(entry);
  }
  return entries;
}

function evalItem(item: Item, scope: Scope): Entry | null {
  if (item.type === "vardef") {
    scope.set(item.name, evalExpr(item.value, scope));
    return null;
  }
  if (item.type === "leaf") {
    return { kind: "leaf", key: item.key, value: evalExpr(item.value, scope) };
  }
  const header = item.header === null ? null : item.header.text;
  return { kind: "node", name: item.name, header, children: evalItems(item.body, scope) };
}

function evalExpr(expr: Expr, scope: Scope): Value {
  switch (expr.type) {
    case "int":
      return makeInt(expr.value);
    case "float":
      return { kind: "float", value: expr.value };
    case "bool":
      return { kind: "bool", value: expr.value };
    case "nil":
      return { kind: "nil" };
    case "str":
      if (expr.lit.kind === "quoted") return { kind: "string", value: expr.lit.text };
      return { kind: "string", value: evalBareParts(expr.lit.parts, scope) };
    case "color":
      return parseColor(expr.hex);
    case "duration":
      if (expr.unit !== "ms" && expr.unit !== "s" && expr.unit !== "m") {
        throw new EvalError(`scorium::eval::type_error: unknown duration unit ${expr.unit}`);
      }
      return { kind: "duration", amount: expr.amount, unit: expr.unit };
    case "list":
      return { kind: "list", value: expr.items.map((e) => evalExpr(e, scope)) };
    case "ident": {
      // §1 resolution: step 2 (`@`-variable), then step 5 (fallback to
      // a literal string). Steps 1/3/4 are not implemented.
      const bound = scope.get(expr.name);
      if (bound !== undefined) return bound;
      return { kind: "string", value: expr.name };
    }
    case "unary":
      return evalUnary(expr.op, evalExpr(expr.operand, scope));
    case "binary":
      return evalBinary(expr.op, expr, scope);
  }
}

function evalBareParts(parts: Array<{ kind: "lit"; text: string } | { kind: "interp"; name: string }>, scope: Scope): string {
  let out = "";
  for (const part of parts) {
    if (part.kind === "lit") {
      out += part.text;
      continue;
    }
    const bound = scope.get(part.name);
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

function evalUnary(op: "neg" | "not", v: Value): Value {
  if (op === "not") return { kind: "bool", value: !isTruthy(v) };
  // neg
  if (v.kind === "int") return makeInt(-v.value);
  if (v.kind === "float") return { kind: "float", value: -v.value };
  throw new EvalError(`scorium::eval::type_error: cannot negate a ${v.kind}`);
}

function evalBinary(op: import("./ast.ts").BinOp, expr: Extract<Expr, { type: "binary" }>, scope: Scope): Value {
  if (op === "and") {
    const l = evalExpr(expr.left, scope);
    return isTruthy(l) ? evalExpr(expr.right, scope) : l;
  }
  if (op === "or") {
    const l = evalExpr(expr.left, scope);
    return isTruthy(l) ? l : evalExpr(expr.right, scope);
  }
  const l = evalExpr(expr.left, scope);
  const r = evalExpr(expr.right, scope);
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

/** Fixture/runtime equality per scorium-spec §2: exact for Int/Float pairs, false for other mismatched-type pairs (not an error). */
function valuesEqual(l: Value, r: Value): boolean {
  if (l.kind === "int" && r.kind === "float") return compareIntFloat(l.value, r.value) === 0;
  if (l.kind === "float" && r.kind === "int") return compareIntFloat(r.value, l.value) === 0;
  if (l.kind !== r.kind) return false;
  switch (l.kind) {
    case "int":
      return l.value === (r as typeof l).value;
    case "float": {
      const rv = (r as typeof l).value;
      return l.value === rv; // NaN !== NaN here, matching section 2's runtime `==` (not fixture-assertion equality)
    }
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
