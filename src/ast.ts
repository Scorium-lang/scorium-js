/**
 * The Scorium syntax tree -- declarative subset only (scorium-spec §1).
 * No variables, expressions/operators, control flow, functions,
 * `include`, or `script {}` yet; see README.md "Current scope".
 */

export interface Document {
  items: Item[];
}

export type Item = LeafDecl | NodeDecl;

export interface LeafDecl {
  type: "leaf";
  key: string;
  value: Expr;
}

export type HeaderValue = { kind: "bare"; text: string } | { kind: "quoted"; text: string };

export interface NodeDecl {
  type: "node";
  name: string;
  header: HeaderValue | null;
  body: Item[];
}

export type Expr =
  | { type: "int"; value: bigint }
  | { type: "float"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "nil" }
  | { type: "color"; hex: string }
  | { type: "duration"; amount: number; unit: string }
  | { type: "str"; value: string }
  | { type: "list"; items: Expr[] }
  /**
   * A bare identifier used where an expression is expected. Per §1's
   * identifier resolution, this can in principle resolve to a local /
   * `@`-variable / sibling leaf / host value -- none of which this
   * build implements yet (see README.md). It always falls back to a
   * literal string for now (§1 resolution step 5 only).
   */
  | { type: "ident"; name: string };
