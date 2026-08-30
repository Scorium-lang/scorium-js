import type { BinOp, Document, Expr, HeaderValue, Item } from "./ast.ts";
import { Lexer } from "./lexer.ts";
import type { Token, TokenKind } from "./token.ts";

export class ParseError extends Error {}

export function parse(src: string): Document {
  const tokens = new Lexer(src).tokenize();
  return new Parser(tokens).parseDocument();
}

/** Throws `dollar_in_expression` when a `$`-containing bare string is used as an operand of a binary operator (scorium-spec §1) -- valid only as a whole, standalone value. */
function rejectDollarBare(expr: Expr): void {
  if (expr.type === "str" && expr.lit.kind === "bare" && expr.lit.parts.some((p) => p.kind === "interp")) {
    throw new ParseError("scorium::parse::dollar_in_expression: `$name` cannot be used in an expression; use `name` for an expression value");
  }
}

const CMP_OPS: Partial<Record<TokenKind, BinOp>> = { eqeq: "eq", noteq: "noteq", lt: "lt", gt: "gt", lte: "lte", gte: "gte" };
const ADD_OPS: Partial<Record<TokenKind, BinOp>> = { plus: "add", minus: "sub" };
const MUL_OPS: Partial<Record<TokenKind, BinOp>> = { star: "mul", slash: "div", percent: "mod" };

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

  /** Parses items until one of `stops` is next, requiring a newline between consecutive items (matches parseDocument's own top-level rule). */
  private parseBodyUntil(stops: TokenKind[]): Item[] {
    const items: Item[] = [];
    this.skipNewlines();
    while (!stops.includes(this.peek().kind)) {
      if (this.peek().kind === "eof") {
        throw new ParseError("scorium::parse::unexpected_eof: unexpected end of file inside a block");
      }
      items.push(this.parseItem());
      if (!stops.includes(this.peek().kind)) this.expect("newline");
      this.skipNewlines();
    }
    return items;
  }

  private parseItem(): Item {
    switch (this.peek().kind) {
      case "at": {
        this.advance();
        const nameTok = this.expect("ident");
        this.expect("eq");
        const value = this.parseExpr();
        return { type: "vardef", name: nameTok.text, value };
      }
      case "if":
        return this.parseIf();
      case "for":
        return this.parseFor();
      case "while":
        return this.parseWhile();
      case "local": {
        this.advance();
        const nameTok = this.expect("ident");
        this.expect("eq");
        const value = this.parseExpr();
        return { type: "local", name: nameTok.text, value };
      }
      case "return": {
        this.advance();
        const stopsHere = ["newline", "eof", "end", "rbrace"] as TokenKind[];
        const value = stopsHere.includes(this.peek().kind) ? null : this.parseExpr();
        return { type: "return", value };
      }
      case "fn":
        return this.parseFnDef();
      case "include": {
        this.advance();
        const path = this.parsePrimary();
        return { type: "include", path };
      }
    }

    const nameTok = this.expect("ident");
    const next = this.peek();

    if (next.kind === "eq") {
      this.advance();
      const value = this.parseExpr();
      return { type: "leaf", key: nameTok.text, value };
    }
    if (next.kind === "lparen") {
      return { type: "exprstmt", expr: this.parseCallArgs({ type: "ident", name: nameTok.text }) };
    }

    let header: HeaderValue | null = null;
    if (next.kind !== "lbrace" && next.kind !== "newline" && next.kind !== "eof") {
      header = this.parseHeader();
    }
    this.expect("lbrace");
    const body = this.parseBodyUntil(["rbrace"]);
    this.expect("rbrace");
    return { type: "node", name: nameTok.text, header, body };
  }

  private parseIf(): Item {
    this.expect("if");
    const cond = this.parseExpr();
    this.expect("then");
    const thenBody = this.parseBodyUntil(["elseif", "else", "end"]);
    const elifs: Array<{ cond: Expr; body: Item[] }> = [];
    while (this.peek().kind === "elseif") {
      this.advance();
      const c = this.parseExpr();
      this.expect("then");
      const body = this.parseBodyUntil(["elseif", "else", "end"]);
      elifs.push({ cond: c, body });
    }
    let elseBody: Item[] | null = null;
    if (this.peek().kind === "else") {
      this.advance();
      elseBody = this.parseBodyUntil(["end"]);
    }
    this.expect("end");
    return { type: "if", cond, thenBody, elifs, elseBody };
  }

  private parseFor(): Item {
    this.expect("for");
    const varTok = this.expect("ident");
    this.expect("eq");
    const start = this.parseExpr();
    this.expect("comma");
    const stop = this.parseExpr();
    let step: Expr | null = null;
    if (this.peek().kind === "comma") {
      this.advance();
      step = this.parseExpr();
    }
    this.expect("do");
    const body = this.parseBodyUntil(["end"]);
    this.expect("end");
    return { type: "for", varName: varTok.text, start, stop, step, body };
  }

  private parseWhile(): Item {
    this.expect("while");
    const cond = this.parseExpr();
    this.expect("do");
    const body = this.parseBodyUntil(["end"]);
    this.expect("end");
    return { type: "while", cond, body };
  }

  private parseFnDef(): Item {
    this.expect("fn");
    const nameTok = this.expect("ident");
    this.expect("lparen");
    const params: string[] = [];
    if (this.peek().kind !== "rparen") {
      params.push(this.expect("ident").text);
      while (this.peek().kind === "comma") {
        this.advance();
        params.push(this.expect("ident").text);
      }
    }
    this.expect("rparen");
    this.expect("lbrace");
    const body = this.parseBodyUntil(["rbrace"]);
    this.expect("rbrace");
    return { type: "fndef", name: nameTok.text, params, body };
  }

  /** Assumes `lparen` is the next token (the callee has already been parsed). */
  private parseCallArgs(callee: Expr): Expr {
    this.expect("lparen");
    const args: Expr[] = [];
    if (this.peek().kind !== "rparen") {
      args.push(this.parseExpr());
      while (this.peek().kind === "comma") {
        this.advance();
        args.push(this.parseExpr());
      }
    }
    this.expect("rparen");
    return { type: "call", callee, args };
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
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.peek().kind === "or") {
      this.advance();
      rejectDollarBare(left);
      const right = this.parseAnd();
      rejectDollarBare(right);
      left = { type: "binary", op: "or", left, right };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseCmp();
    while (this.peek().kind === "and") {
      this.advance();
      rejectDollarBare(left);
      const right = this.parseCmp();
      rejectDollarBare(right);
      left = { type: "binary", op: "and", left, right };
    }
    return left;
  }

  private parseCmp(): Expr {
    let left = this.parseAdd();
    const op = CMP_OPS[this.peek().kind];
    if (op) {
      this.advance();
      rejectDollarBare(left);
      const right = this.parseAdd();
      rejectDollarBare(right);
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    for (;;) {
      const op = ADD_OPS[this.peek().kind];
      if (!op) break;
      this.advance();
      rejectDollarBare(left);
      const right = this.parseMul();
      rejectDollarBare(right);
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const op = MUL_OPS[this.peek().kind];
      if (!op) break;
      this.advance();
      rejectDollarBare(left);
      const right = this.parseUnary();
      rejectDollarBare(right);
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.peek().kind === "minus") {
      this.advance();
      const operand = this.parseUnary();
      rejectDollarBare(operand);
      return { type: "unary", op: "neg", operand };
    }
    if (this.peek().kind === "not") {
      this.advance();
      const operand = this.parseUnary();
      rejectDollarBare(operand);
      return { type: "unary", op: "not", operand };
    }
    return this.parsePrimary();
  }

  /** primary { call_suffix | member_suffix } -- postfix chain on top of one atom. */
  private parsePrimary(): Expr {
    let expr = this.parseAtom();
    for (;;) {
      if (this.peek().kind === "dot") {
        this.advance();
        const field = this.expect("ident").text;
        expr = { type: "member", base: expr, field };
        continue;
      }
      if (this.peek().kind === "lparen") {
        expr = this.parseCallArgs(expr);
        continue;
      }
      break;
    }
    return expr;
  }

  private parseAtom(): Expr {
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
        return { type: "str", lit: { kind: "quoted", text: tok.stringValue! } };
      case "barestr":
        this.advance();
        return { type: "str", lit: { kind: "bare", parts: tok.bareParts! } };
      case "ident":
        this.advance();
        return { type: "ident", name: tok.text };
      case "lbracket":
        return this.parseList();
      case "lparen": {
        this.advance();
        const inner = this.parseExpr();
        this.expect("rparen");
        return inner;
      }
      case "at":
        throw new ParseError(
          `scorium::parse::at_in_expression: \`@${this.tokens[this.i + 1]?.text ?? ""}\` only defines a variable on its own line; in an expression use the plain name`,
        );
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
