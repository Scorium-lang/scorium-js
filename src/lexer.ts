import type { Token, TokenKind } from "./token.ts";

/**
 * Lexer for the declarative subset (scorium-spec §1). `#` is the
 * color-literal prefix only where a value is expected (right after `=`,
 * `[`, or `,`); everywhere else it starts a line comment. This lexer
 * tracks that as internal state derived purely from the previously
 * emitted token, which is sufficient for the declarative grammar this
 * build supports (see README.md "Current scope").
 */
export class LexError extends Error {}

const DURATION_UNITS = ["ms", "s", "m"];

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentContinue(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch);
}
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

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
    const isValueToken =
      kind === "ident" ||
      kind === "int" ||
      kind === "float" ||
      kind === "bool" ||
      kind === "nil" ||
      kind === "color" ||
      kind === "duration" ||
      kind === "string" ||
      kind === "rbracket";
    if (kind === "eq" || kind === "lbracket" || kind === "comma") {
      this.expectValue = true;
    } else if (isValueToken || kind === "newline") {
      this.expectValue = false;
    }
    if (kind === "lbracket") this.bracketDepth++;
    if (kind === "rbracket") this.bracketDepth = Math.max(0, this.bracketDepth - 1);
    return { kind, text: this.src.slice(start, this.pos), pos: start, ...extra };
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
    if (ch === "=") {
      this.pos++;
      return this.push("eq", {}, start);
    }
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
    if (ch === ",") {
      this.pos++;
      return this.push("comma", {}, start);
    }
    if (ch === '"') return this.lexQuotedString(start);
    if (ch === "#" && this.expectValue) return this.lexColor(start);
    if (isDigit(ch) || (ch === "." && isDigit(this.src[start + 1] ?? ""))) return this.lexNumber(start);
    if (isIdentStart(ch)) return this.lexIdent(start);

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
    const isHex = (c: string) => /[0-9A-Fa-f]/.test(c);
    let hex = "";
    while (isHex(this.src[this.pos] ?? "")) {
      hex += this.src[this.pos];
      this.pos++;
    }
    if (hex.length !== 6 && hex.length !== 8) {
      throw new LexError(`scorium::lex::unexpected_char: color literal must have 6 or 8 hex digits, got ${hex.length}`);
    }
    return this.push("color", { colorHex: hex.toUpperCase() }, start);
  }

  private lexNumber(start: number): Token {
    while (isDigit(this.src[this.pos] ?? "")) this.pos++;
    let isFloat = false;
    if (this.src[this.pos] === "." && isDigit(this.src[this.pos + 1] ?? "")) {
      isFloat = true;
      this.pos++;
      while (isDigit(this.src[this.pos] ?? "")) this.pos++;
    }
    const numText = this.src.slice(start, this.pos);

    // Duration: number immediately followed by a unit, not itself
    // followed by further identifier-continuation characters.
    for (const unit of DURATION_UNITS) {
      const after = this.pos + unit.length;
      if (this.src.slice(this.pos, after) === unit && !isIdentContinue(this.src[after] ?? "")) {
        this.pos = after;
        return this.push("duration", { durationAmount: Number(numText), durationUnit: unit }, start);
      }
    }

    if (isFloat) return this.push("float", { floatValue: Number(numText) }, start);
    return this.push("int", { intValue: BigInt(numText) }, start);
  }

  private lexIdent(start: number): Token {
    while (isIdentContinue(this.src[this.pos] ?? "")) this.pos++;
    const text = this.src.slice(start, this.pos);
    if (text === "true") return this.push("bool", { boolValue: true }, start);
    if (text === "false") return this.push("bool", { boolValue: false }, start);
    if (text === "nil") return this.push("nil", {}, start);
    return this.push("ident", {}, start);
  }
}
