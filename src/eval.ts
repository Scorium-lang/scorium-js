import type { Document, Expr, Item } from "./ast.ts";
import type { Entry } from "./entry.ts";
import { makeInt, type Value } from "./value.ts";

export class EvalError extends Error {}

/**
 * Evaluates the declarative subset only (see README.md "Current scope").
 * Identifier resolution only ever reaches §1's step 5 (fallback to a
 * literal string) -- steps 1-4 (locals/params, `@`-variables, sibling
 * leaves, host values) require features this build doesn't have yet.
 */
export function evaluate(doc: Document): Entry[] {
  return doc.items.map(evalItem);
}

function evalItem(item: Item): Entry {
  if (item.type === "leaf") {
    return { kind: "leaf", key: item.key, value: evalExpr(item.value) };
  }
  const header = item.header === null ? null : item.header.text;
  return { kind: "node", name: item.name, header, children: item.body.map(evalItem) };
}

function evalExpr(expr: Expr): Value {
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
      return { kind: "string", value: expr.value };
    case "color":
      return parseColor(expr.hex);
    case "duration":
      if (expr.unit !== "ms" && expr.unit !== "s" && expr.unit !== "m") {
        throw new EvalError(`scorium::eval::type_error: unknown duration unit ${expr.unit}`);
      }
      return { kind: "duration", amount: expr.amount, unit: expr.unit };
    case "list":
      return { kind: "list", value: expr.items.map(evalExpr) };
    case "ident":
      // §1 resolution step 5: falls back to a literal string. Steps 1-4
      // are not implemented (no variables/locals/host values yet).
      return { kind: "string", value: expr.name };
  }
}

function parseColor(hex: string): Value {
  const byte = (s: string) => parseInt(s, 16);
  const r = byte(hex.slice(0, 2));
  const g = byte(hex.slice(2, 4));
  const b = byte(hex.slice(4, 6));
  const a = hex.length === 8 ? byte(hex.slice(6, 8)) : 255;
  return { kind: "color", r, g, b, a };
}
