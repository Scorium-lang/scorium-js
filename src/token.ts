import type { BarePart } from "./ast.ts";

export type TokenKind =
  | "ident"
  | "barestr"
  | "int"
  | "float"
  | "bool"
  | "nil"
  | "color"
  | "duration"
  | "string"
  | "eq"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "lparen"
  | "rparen"
  | "comma"
  | "at"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "eqeq"
  | "noteq"
  | "lt"
  | "gt"
  | "lte"
  | "gte"
  | "and"
  | "or"
  | "not"
  | "newline"
  | "eof";

export interface Token {
  kind: TokenKind;
  text: string;
  intValue?: bigint;
  floatValue?: number;
  boolValue?: boolean;
  colorHex?: string;
  durationAmount?: number;
  durationUnit?: string;
  stringValue?: string;
  bareParts?: BarePart[];
  pos: number;
  /** True if this operator token had no whitespace on either side -- a lex error for everything except `+`/`-`. */
  squeezed?: boolean;
}
