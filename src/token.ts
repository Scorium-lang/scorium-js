export type TokenKind =
  | "ident"
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
  | "comma"
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
  pos: number;
}
