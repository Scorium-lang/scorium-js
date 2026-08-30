/**
 * The Scorium syntax tree. Covers the declarative subset, variables,
 * full expressions, control flow, and functions (scorium-spec §1-3).
 * Still missing: member/method calls, `include`, `script {}` -- see
 * README.md "Current scope".
 */

export interface Document {
  items: Item[];
}

export type Item = LeafDecl | NodeDecl | VarDef | IfStmt | ForStmt | WhileStmt | LocalStmt | ReturnStmt | FnDef | ExprStmt;

export interface LeafDecl {
  type: "leaf";
  key: string;
  value: Expr;
}

export interface VarDef {
  type: "vardef";
  name: string;
  value: Expr;
}

export type HeaderValue = { kind: "bare"; text: string } | { kind: "quoted"; text: string };

export interface NodeDecl {
  type: "node";
  name: string;
  header: HeaderValue | null;
  body: Item[];
}

export interface IfStmt {
  type: "if";
  cond: Expr;
  thenBody: Item[];
  elifs: Array<{ cond: Expr; body: Item[] }>;
  elseBody: Item[] | null;
}

export interface ForStmt {
  type: "for";
  varName: string;
  start: Expr;
  stop: Expr;
  step: Expr | null;
  body: Item[];
}

export interface WhileStmt {
  type: "while";
  cond: Expr;
  body: Item[];
}

/** `local name = expr`. Unlike `@name = expr`, this binding is reassignable via a later `name = expr` leaf (scorium-spec §1 "Reassignment"). */
export interface LocalStmt {
  type: "local";
  name: string;
  value: Expr;
}

export interface ReturnStmt {
  type: "return";
  value: Expr | null;
}

export interface FnDef {
  type: "fndef";
  name: string;
  params: string[];
  body: Item[];
}

/** A call expression used as a full statement (`ItemKind::Call` in scorium-rust). */
export interface ExprStmt {
  type: "exprstmt";
  expr: Expr;
}

/** A bare string's parts: literal text interleaved with `$name` interpolation (scorium-spec §1). */
export type BarePart = { kind: "lit"; text: string } | { kind: "interp"; name: string };

export type StrLit = { kind: "quoted"; text: string } | { kind: "bare"; parts: BarePart[] };

export type UnOp = "neg" | "not";
export type BinOp = "add" | "sub" | "mul" | "div" | "mod" | "eq" | "noteq" | "lt" | "gt" | "lte" | "gte" | "and" | "or";

export type Expr =
  | { type: "int"; value: bigint }
  | { type: "float"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "nil" }
  | { type: "color"; hex: string }
  | { type: "duration"; amount: number; unit: string }
  | { type: "str"; lit: StrLit }
  | { type: "list"; items: Expr[] }
  /**
   * A bare identifier used where an expression is expected. Per §1's
   * identifier resolution: (1) local/param/loop-var, (2) `@`-variable,
   * (3) sibling leaf, (4) host value, (5) fallback to a literal string.
   * This build implements steps 1, 2, and 5 -- see README.md.
   */
  | { type: "ident"; name: string }
  | { type: "unary"; op: UnOp; operand: Expr }
  | { type: "binary"; op: BinOp; left: Expr; right: Expr }
  /**
   * `base.field`, uncalled. Per §1: if `base` isn't a real binding this
   * is just a literal string (`cert.pem`); only a real value throws
   * (no field access without a call -- only `.field(...)` is
   * supported). This is a call's callee shape.
   */
  | { type: "member"; base: Expr; field: string }
  /** `callee(args)`. `callee` is an `ident` (plain function call) or a `member` (method call, colors only); anything else is not callable. */
  | { type: "call"; callee: Expr; args: Expr[] };
