import type { SourceFile, SourceSpan } from "./source.ts";

/**
 * The Scorium syntax tree. Covers the declarative subset, variables,
 * full expressions, control flow, functions, includes, and raw script
 * preservation (scorium-spec §1-3).
 */

/** A `#`/`--` line comment or a `--[[ ]]` block comment (scorium-spec §4). */
export interface Comment {
  text: string;
  block: boolean;
}

/**
 * Comment trivia attached to an item, for the formatter only --
 * evaluation never reads this. Preservation is item-granularity only:
 * a comment leading an item (its own line above) or trailing one (same
 * line, after it). A comment between `=` and its value, or inside a
 * list/call's parens, isn't tracked and is dropped on format -- matches
 * scorium-rust's own documented limitation.
 */
export interface Trivia {
  leading: Comment[];
  trailing: Comment | null;
  /** Was there a blank line before this item (or its leading comments) in the source? The formatter reproduces at most one. */
  blankLineBefore: boolean;
}

export interface Document {
  items: Item[];
  /** Comments left over after the last item (end-of-file trivia). */
  trailing: Comment[];
  /** Original source retained for diagnostics and editor/tool integrations. */
  source?: SourceFile;
}

export interface Spanned {
  span?: SourceSpan;
}

export type Item = LeafDecl | NodeDecl | VarDef | IfStmt | ForStmt | WhileStmt | LocalStmt | ReturnStmt | FnDef | ExprStmt | IncludeStmt | ScriptBlock;

/**
 * `script { ... }`: raw Lua text, captured verbatim and never parsed
 * as Scorium or reformatted (scorium-spec §1). This build can parse
 * and format a document containing one, but not execute it -- see
 * README.md and scorium-spec §1/§3.
 */
export interface ScriptBlock extends Spanned {
  type: "script";
  raw: string;
  trivia?: Trivia;
}

export interface IncludeStmt extends Spanned {
  type: "include";
  path: Expr;
  trivia?: Trivia;
}

export interface LeafDecl extends Spanned {
  type: "leaf";
  key: string;
  value: Expr;
  trivia?: Trivia;
}

export interface VarDef extends Spanned {
  type: "vardef";
  name: string;
  value: Expr;
  trivia?: Trivia;
}

export type HeaderValue = { kind: "bare"; text: string } | { kind: "quoted"; text: string };

export interface NodeDecl extends Spanned {
  type: "node";
  name: string;
  header: HeaderValue | null;
  body: Item[];
  trivia?: Trivia;
}

export interface IfStmt extends Spanned {
  type: "if";
  cond: Expr;
  thenBody: Item[];
  elifs: Array<{ cond: Expr; body: Item[] }>;
  elseBody: Item[] | null;
  trivia?: Trivia;
}

export interface ForStmt extends Spanned {
  type: "for";
  varName: string;
  start: Expr;
  stop: Expr;
  step: Expr | null;
  body: Item[];
  trivia?: Trivia;
}

export interface WhileStmt extends Spanned {
  type: "while";
  cond: Expr;
  body: Item[];
  trivia?: Trivia;
}

/** `local name = expr`. Unlike `@name = expr`, this binding is reassignable via a later `name = expr` leaf (scorium-spec §1 "Reassignment"). */
export interface LocalStmt extends Spanned {
  type: "local";
  name: string;
  value: Expr;
  trivia?: Trivia;
}

export interface ReturnStmt extends Spanned {
  type: "return";
  value: Expr | null;
  trivia?: Trivia;
}

export interface FnDef extends Spanned {
  type: "fndef";
  name: string;
  params: string[];
  body: Item[];
  trivia?: Trivia;
}

/** A call expression used as a full statement (`ItemKind::Call` in scorium-rust). */
export interface ExprStmt extends Spanned {
  type: "exprstmt";
  expr: Expr;
  trivia?: Trivia;
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
