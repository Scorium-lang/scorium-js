import type { BarePart } from "./ast.ts";
import type { Token, TokenKind } from "./token.ts";

/**
 * Lexer for scorium-spec §1. Two context-sensitive rules, both tracked
 * as internal state derived from the previously emitted token (no
 * external parser feedback needed for this grammar):
 *
 * - `#` is a color-literal prefix only where a value is expected
 *   (right after `=`, `[`, or `,`); everywhere else it starts a line
 *   comment.
 * - `+`/`-` are embeddable unspaced inside a bare word (`SUPER+Return`,
 *   `node-1`) and never trigger a lex error; every other binary
 *   operator (`* / % == ~= < > <= >=`) is a `squeezed_operator` lex
 *   error when it has no whitespace on either side (`base*2`).
 */
export class LexError extends Error {}

const DURATION_UNITS = ["ms", "s", "m"];

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_]/.test(ch);
}
function isIdentContinue(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
}
function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}
function isSqueezeBoundary(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return !/\s/.test(ch) && !",{}[]".includes(ch);
}

/** Tokens after which a value/expression follows next, so `#` means color and a value-position bare run is used. */
const VALUE_FOLLOWS = new Set<TokenKind>([
  "eq",
  "lbracket",
  "comma",
  "lparen",
  "plus",
  "minus",
  "star",
  "slash",
  "percent",
  "eqeq",
  "noteq",
  "lt",
  "gt",
  "lte",
  "gte",
  "and",
  "or",
  "not",
  "if",
  "elseif",
  "while",
  "return",
  "include",
]);
/** Tokens after which a key/node/param name or a new statement follows, so `#` means comment and a plain-ident scan is used. */
const VALUE_ENDS = new Set<TokenKind>([
  "ident",
  "barestr",
  "int",
  "float",
  "bool",
  "nil",
  "color",
  "duration",
  "string",
  "rbracket",
  "rparen",
  "newline",
  "then",
  "do",
  "end",
  "else",
  "for",
  "local",
  "fn",
  "dot",
]);

export class Lexer {
  private readonly src: string;
  private pos = 0;
  private expectValue = false;
  private bracketDepth = 0;

  constructor(src: string) {
    this.src = src;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    for (;;) {
      const tok = this.next();
      tokens.push(tok);
      if (tok.kind === "eof") break;
    }
    return tokens;
  }

  private push(kind: TokenKind, extra: Partial<Token> = {}, start = this.pos): Token {
    if (VALUE_FOLLOWS.has(kind)) {
      this.expectValue = true;
    } else if (VALUE_ENDS.has(kind)) {
      this.expectValue = false;
    }
    if (kind === "lbracket") this.bracketDepth++;
    if (kind === "rbracket") this.bracketDepth = Math.max(0, this.bracketDepth - 1);
    return { kind, text: this.src.slice(start, this.pos), pos: start, ...extra };
  }

  /** Emits a possibly-squeeze-checked operator token. `+`/`-` never pass `checkSqueeze: true`. */
  private pushOperator(kind: TokenKind, len: number, start: number, checkSqueeze: boolean): Token {
    this.pos = start + len;
    if (checkSqueeze) {
      const before = this.src[start - 1];
      const after = this.src[this.pos];
      if (isSqueezeBoundary(before) && isSqueezeBoundary(after)) {
        const suggestion = `${before} ${this.src.slice(start, this.pos)} ${after}`;
        throw new LexError(
          `scorium::lex::squeezed_operator: operators in expressions require spaces around them; write "${suggestion}"`,
        );
      }
    }
    return this.push(kind, {}, start);
  }

  private next(): Token {
    this.skipTrivia();
    const start = this.pos;
    if (this.pos >= this.src.length) return this.push("eof", {}, start);

    const ch = this.src[start]!;

    if (ch === "\n") {
      this.pos++;
      if (this.bracketDepth > 0) return this.next();
      return this.push("newline", {}, start);
    }
    if (ch === "=" && this.src[start + 1] === "=") return this.pushOperator("eqeq", 2, start, true);
    if (ch === "=") {
      this.pos++;
      return this.push("eq", {}, start);
    }
    if (ch === "~" && this.src[start + 1] === "=") return this.pushOperator("noteq", 2, start, true);
    if (ch === "<" && this.src[start + 1] === "=") return this.pushOperator("lte", 2, start, true);
    if (ch === "<") return this.pushOperator("lt", 1, start, true);
    if (ch === ">" && this.src[start + 1] === "=") return this.pushOperator("gte", 2, start, true);
    if (ch === ">") return this.pushOperator("gt", 1, start, true);
    if (ch === "*") return this.pushOperator("star", 1, start, true);
    if (ch === "/") return this.pushOperator("slash", 1, start, true);
    if (ch === "%") return this.pushOperator("percent", 1, start, true);
    if (ch === "+") return this.pushOperator("plus", 1, start, false);
    if (ch === "-") return this.pushOperator("minus", 1, start, false);
    if (ch === "{") {
      this.pos++;
      return this.push("lbrace", {}, start);
    }
    if (ch === "}") {
      this.pos++;
      return this.push("rbrace", {}, start);
    }
    if (ch === "[") {
      this.pos++;
      return this.push("lbracket", {}, start);
    }
    if (ch === "]") {
      this.pos++;
      return this.push("rbracket", {}, start);
    }
    if (ch === "(") {
      this.pos++;
      return this.push("lparen", {}, start);
    }
    if (ch === ")") {
      this.pos++;
      return this.push("rparen", {}, start);
    }
    if (ch === ",") {
      this.pos++;
      return this.push("comma", {}, start);
    }
    if (ch === ".") {
      this.pos++;
      return this.push("dot", {}, start);
    }
    if (ch === "@") {
      this.pos++;
      return this.push("at", {}, start);
    }
    if (ch === '"') return this.lexQuotedString(start);
    if (ch === "#" && this.expectValue) return this.lexColor(start);
    if (isDigit(ch) || (ch === "." && isDigit(this.src[start + 1]))) return this.lexNumber(start);
    if (this.expectValue && (isIdentStart(ch) || (ch === "$" && isIdentStart(this.src[start + 1])))) {
      return this.lexValueBareRun(start);
    }
    if (isIdentStart(ch)) return this.lexPlainIdent(start);

    throw new LexError(`scorium::lex::unexpected_char: unexpected character ${JSON.stringify(ch)} at offset ${start}`);
  }

  /** Skips whitespace (not newlines) and comments; `#` here is only ever a comment, since a value-position `#` is handled by `next()` before this runs. */
  private skipTrivia(): void {
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.pos++;
        continue;
      }
      if (ch === "#" && !this.expectValue) {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (ch === "-" && this.src[this.pos + 1] === "-") {
        if (this.src[this.pos + 2] === "[" && this.src[this.pos + 3] === "[") {
          const close = this.src.indexOf("]]", this.pos + 4);
          if (close === -1) throw new LexError("scorium::lex::unterminated_comment: unterminated block comment");
          this.pos = close + 2;
          continue;
        }
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      break;
    }
  }

  private lexQuotedString(start: number): Token {
    this.pos++; // opening quote
    let out = "";
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === undefined || ch === "\n") {
        throw new LexError("scorium::lex::unterminated_string: unterminated string literal");
      }
      if (ch === '"') {
        this.pos++;
        break;
      }
      if (ch === "\\") {
        const esc = this.src[this.pos + 1];
        const map: Record<string, string> = { '"': '"', "\\": "\\", n: "\n", t: "\t", r: "\r" };
        if (esc === undefined || !(esc in map)) {
          throw new LexError(`scorium::lex::unexpected_char: invalid escape \\${esc ?? ""}`);
        }
        out += map[esc];
        this.pos += 2;
        continue;
      }
      out += ch;
      this.pos++;
    }
    return this.push("string", { stringValue: out }, start);
  }

  private lexColor(start: number): Token {
    this.pos++; // '#'
    const isHex = (c: string | undefined) => c !== undefined && /[0-9A-Fa-f]/.test(c);
    let hex = "";
    while (isHex(this.src[this.pos])) {
      hex += this.src[this.pos];
      this.pos++;
    }
    if (hex.length !== 6 && hex.length !== 8) {
      throw new LexError(`scorium::lex::unexpected_char: color literal must have 6 or 8 hex digits, got ${hex.length}`);
    }
    return this.push("color", { colorHex: hex.toUpperCase() }, start);
  }

  private lexNumber(start: number): Token {
    while (isDigit(this.src[this.pos])) this.pos++;
    let isFloat = false;
    if (this.src[this.pos] === "." && isDigit(this.src[this.pos + 1])) {
      isFloat = true;
      this.pos++;
      while (isDigit(this.src[this.pos])) this.pos++;
    }
    const numText = this.src.slice(start, this.pos);

    for (const unit of DURATION_UNITS) {
      const after = this.pos + unit.length;
      if (this.src.slice(this.pos, after) === unit && !isIdentContinue(this.src[after])) {
        this.pos = after;
        return this.push("duration", { durationAmount: Number(numText), durationUnit: unit }, start);
      }
    }

    if (isFloat) return this.push("float", { floatValue: Number(numText) }, start);
    return this.push("int", { intValue: BigInt(numText) }, start);
  }

  /** Strict key/node-name identifier: letters/digits/`_`/`-` only -- no `+` embedding, no `$` interpolation (those are value-position `bare_str` extensions, §1). */
  private lexPlainIdent(start: number): Token {
    while (isIdentContinue(this.src[this.pos])) this.pos++;
    return this.finishIdentLike(start, this.src.slice(start, this.pos));
  }

  /**
   * Value-position bare run: a mixed sequence of ident-continue
   * characters, `$name` interpolations, and unspaced `+`/`-` chained
   * onto a continuing run. Produces a plain `ident` token if there was
   * no `$` anywhere (matching `ExprKind::Ident`, including any embedded
   * `+`/`-`), otherwise a `barestr` token carrying literal/interpolation
   * parts (matching `StrLit::Bare`).
   */
  private lexValueBareRun(start: number): Token {
    const parts: BarePart[] = [];
    let lit = "";
    let hasDollar = false;

    for (;;) {
      const ch = this.src[this.pos];
      if (isIdentContinue(ch)) {
        lit += ch;
        this.pos++;
        continue;
      }
      if (ch === "$" && isIdentStart(this.src[this.pos + 1])) {
        hasDollar = true;
        if (lit) {
          parts.push({ kind: "lit", text: lit });
          lit = "";
        }
        this.pos++; // '$'
        const nameStart = this.pos;
        while (isIdentContinue(this.src[this.pos])) this.pos++;
        parts.push({ kind: "interp", name: this.src.slice(nameStart, this.pos) });
        continue;
      }
      if (ch === "+" || ch === "-") {
        const next = this.src[this.pos + 1];
        if (isIdentContinue(next) || next === "$") {
          lit += ch;
          this.pos++;
          continue;
        }
      }
      break;
    }
    if (lit) parts.push({ kind: "lit", text: lit });

    if (!hasDollar && parts.length === 1 && parts[0]!.kind === "lit") {
      return this.finishIdentLike(start, parts[0]!.text);
    }
    return this.push("barestr", { bareParts: parts }, start);
  }

  private finishIdentLike(start: number, text: string): Token {
    if (text === "true") return this.push("bool", { boolValue: true }, start);
    if (text === "false") return this.push("bool", { boolValue: false }, start);
    if (text === "nil") return this.push("nil", {}, start);
    if (text === "and") return this.push("and", {}, start);
    if (text === "or") return this.push("or", {}, start);
    if (text === "not") return this.push("not", {}, start);
    if (text === "if") return this.push("if", {}, start);
    if (text === "then") return this.push("then", {}, start);
    if (text === "elseif") return this.push("elseif", {}, start);
    if (text === "else") return this.push("else", {}, start);
    if (text === "end") return this.push("end", {}, start);
    if (text === "for") return this.push("for", {}, start);
    if (text === "do") return this.push("do", {}, start);
    if (text === "while") return this.push("while", {}, start);
    if (text === "local") return this.push("local", {}, start);
    if (text === "return") return this.push("return", {}, start);
    if (text === "fn") return this.push("fn", {}, start);
    if (text === "include") return this.push("include", {}, start);
    return this.push("ident", {}, start);
  }
}
