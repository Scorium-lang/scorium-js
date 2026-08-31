import type { Document, Expr, Item, StrLit } from "./ast.ts";
import { SCORIUM_LANGUAGE_VERSION } from "./version.ts";

/** Stable, implementation-neutral syntax tree used by `scorium parse --json`. */
export function portableAst(document: Document): unknown {
  return {
    type: "document",
    language_version: SCORIUM_LANGUAGE_VERSION,
    items: document.items.map(portableItem),
  };
}

function portableItems(items: readonly Item[]): unknown[] {
  return items.map(portableItem);
}

function portableItem(item: Item): unknown {
  switch (item.type) {
    case "leaf":
      return { kind: "leaf", key: item.key, value: portableExpr(item.value) };
    case "node":
      return {
        kind: "node",
        name: item.name,
        header: item.header,
        body: portableItems(item.body),
      };
    case "vardef":
      return { kind: "var", name: item.name, value: portableExpr(item.value) };
    case "include":
      return { kind: "include", path: portableExpr(item.path) };
    case "if":
      return {
        kind: "if",
        condition: portableExpr(item.cond),
        then: portableItems(item.thenBody),
        else_if: item.elifs.map((branch) => ({ condition: portableExpr(branch.cond), body: portableItems(branch.body) })),
        else: item.elseBody === null ? null : portableItems(item.elseBody),
      };
    case "for":
      return {
        kind: "for",
        variable: item.varName,
        start: portableExpr(item.start),
        stop: portableExpr(item.stop),
        step: item.step === null ? null : portableExpr(item.step),
        body: portableItems(item.body),
      };
    case "while":
      return { kind: "while", condition: portableExpr(item.cond), body: portableItems(item.body) };
    case "local":
      return { kind: "local", name: item.name, value: portableExpr(item.value) };
    case "return":
      return { kind: "return", value: item.value === null ? null : portableExpr(item.value) };
    case "fndef":
      return { kind: "function", name: item.name, parameters: item.params, body: portableItems(item.body) };
    case "exprstmt":
      return { kind: "call", expression: portableExpr(item.expr) };
    case "script":
      return { kind: "script", raw: item.raw };
  }
}

function portableString(lit: StrLit): unknown {
  if (lit.kind === "quoted") return { kind: "quoted", text: lit.text };
  return {
    kind: "bare",
    parts: lit.parts.map((part) =>
      part.kind === "lit" ? { kind: "literal", text: part.text } : { kind: "interpolation", name: part.name },
    ),
  };
}

function portableExpr(expr: Expr): unknown {
  switch (expr.type) {
    case "int":
      return { kind: "int", value: expr.value.toString() };
    case "float":
      return { kind: "float", value: portableFloat(expr.value) };
    case "bool":
      return { kind: "bool", value: expr.value };
    case "nil":
      return { kind: "nil" };
    case "color":
      return { kind: "color", value: expr.hex.toUpperCase() };
    case "duration":
      return { kind: "duration", amount: portableFloat(expr.amount), unit: expr.unit };
    case "str":
      return { kind: "string", value: portableString(expr.lit) };
    case "list":
      return { kind: "list", items: expr.items.map(portableExpr) };
    case "ident":
      return { kind: "identifier", name: expr.name };
    case "unary":
      return { kind: "unary", operator: expr.op, operand: portableExpr(expr.operand) };
    case "binary":
      return { kind: "binary", operator: expr.op, left: portableExpr(expr.left), right: portableExpr(expr.right) };
    case "member":
      return { kind: "member", base: portableExpr(expr.base), field: expr.field };
    case "call":
      return { kind: "invoke", callee: portableExpr(expr.callee), arguments: expr.args.map(portableExpr) };
  }
}

function portableFloat(value: number): string {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  return String(value);
}
