import type { Document, Expr, HeaderValue, Item } from "./ast.ts";
import { Lexer } from "./lexer.ts";
import type { Token } from "./token.ts";

export class ParseError extends Error {}

export function parse(src: string): Document {
  const tokens = new Lexer(src).tokenize();
  return new Parser(tokens).parseDocument();
}

class Parser {
  private readonly tokens: Token[];
  private i = 0;
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.i]!;
  }
  private advance(): Token {
    return this.tokens[this.i++]!;
  }
  private skipNewlines(): void {
    while (this.peek().kind === "newline") this.advance();
  }
  private expect(kind: Token["kind"]): Token {
    const tok = this.peek();
    if (tok.kind !== kind) {
      throw new ParseError(`scorium::parse::unexpected_token: expected ${kind}, found ${tok.kind} (${JSON.stringify(tok.text)}) at offset ${tok.pos}`);
    }
    return this.advance();
  }

  parseDocument(): Document {
    const items: Item[] = [];
    this.skipNewlines();
    while (this.peek().kind !== "eof") {
      items.push(this.parseItem());
      if (this.peek().kind !== "eof") this.expect("newline");
      this.skipNewlines();
    }
    return { items };
  }

  private parseItem(): Item {
    const nameTok = this.expect("ident");
    const next = this.peek();

    if (next.kind === "eq") {
      this.advance();
      const value = this.parseExpr();
      return { type: "leaf", key: nameTok.text, value };
    }

    let header: HeaderValue | null = null;
    if (next.kind !== "lbrace" && next.kind !== "newline" && next.kind !== "eof") {
      header = this.parseHeader();
    }
    this.expect("lbrace");
    this.skipNewlines();
    const body: Item[] = [];
    while (this.peek().kind !== "rbrace") {
      body.push(this.parseItem());
      this.skipNewlines();
    }
    this.expect("rbrace");
    return { type: "node", name: nameTok.text, header, body };
  }

  private parseHeader(): HeaderValue {
    const tok = this.peek();
    if (tok.kind === "string") {
      this.advance();
      return { kind: "quoted", text: tok.stringValue! };
    }
    this.advance();
    return { kind: "bare", text: tok.text };
  }

  private parseExpr(): Expr {
    const tok = this.peek();
    switch (tok.kind) {
      case "int":
        this.advance();
        return { type: "int", value: tok.intValue! };
      case "float":
        this.advance();
        return { type: "float", value: tok.floatValue! };
      case "bool":
        this.advance();
        return { type: "bool", value: tok.boolValue! };
      case "nil":
        this.advance();
        return { type: "nil" };
      case "color":
        this.advance();
        return { type: "color", hex: tok.colorHex! };
      case "duration":
        this.advance();
        return { type: "duration", amount: tok.durationAmount!, unit: tok.durationUnit! };
      case "string":
        this.advance();
        return { type: "str", value: tok.stringValue! };
      case "ident":
        this.advance();
        return { type: "ident", name: tok.text };
      case "lbracket":
        return this.parseList();
      default:
        throw new ParseError(`scorium::parse::unexpected_token: expected a value, found ${tok.kind} at offset ${tok.pos}`);
    }
  }

  private parseList(): Expr {
    this.expect("lbracket");
    const items: Expr[] = [];
    if (this.peek().kind !== "rbracket") {
      items.push(this.parseExpr());
      while (this.peek().kind === "comma") {
        this.advance();
        items.push(this.parseExpr());
      }
    }
    this.expect("rbracket");
    return { type: "list", items };
  }
}
