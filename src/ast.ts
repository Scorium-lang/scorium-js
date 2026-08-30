/**
 * The Scorium syntax tree. Covers the declarative subset plus variables
 * and full expressions (scorium-spec §1) as of this build. Still
 * missing: control flow, functions, `include`, `script {}`, member/call
 * postfix expressions -- see README.md "Current scope".
 */

export interface Document {
  items: Item[];
}

export type Item = LeafDecl | NodeDecl | VarDef;

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
   * This build implements only steps 2 and 5 -- see README.md.
   */
  | { type: "ident"; name: string }
  | { type: "unary"; op: UnOp; operand: Expr }
  | { type: "binary"; op: BinOp; left: Expr; right: Expr };
