import type { BinOp, Comment, Document, Expr, HeaderValue, Item, StrLit, Trivia } from "./ast.ts";

/**
 * Canonical formatter (scorium-spec §4). Output is declared
 * byte-identical across every conforming implementation for the same
 * input and options -- not merely idempotent within one -- so this
 * mirrors scorium-rust's own printer exactly, not "a" tidy rendering.
 */
export interface FormatOptions {
  indentWidth: number;
}
const DEFAULT_OPTIONS: FormatOptions = { indentWidth: 4 };

const DEFAULT_TRIVIA: Trivia = { leading: [], trailing: null, blankLineBefore: false };

const PREC_OR = 1;
const PREC_AND = 3;
const PREC_COMPARE = 5;
const PREC_ADD = 7;
const PREC_MUL = 9;
const PREC_UNARY = 11;
const PREC_POSTFIX = 13;
const PREC_PRIMARY = 15;

const BINOP_PRECEDENCE: Record<BinOp, number> = {
  or: PREC_OR,
  and: PREC_AND,
  eq: PREC_COMPARE,
  noteq: PREC_COMPARE,
  lt: PREC_COMPARE,
  gt: PREC_COMPARE,
  lte: PREC_COMPARE,
  gte: PREC_COMPARE,
  add: PREC_ADD,
  sub: PREC_ADD,
  mul: PREC_MUL,
  div: PREC_MUL,
  mod: PREC_MUL,
};
const BINOP_SYMBOL: Record<BinOp, string> = {
  add: "+",
  sub: "-",
  mul: "*",
  div: "/",
  mod: "%",
  eq: "==",
  noteq: "~=",
  lt: "<",
  gt: ">",
  lte: "<=",
  gte: ">=",
  and: "and",
  or: "or",
};

export function format(doc: Document, options: FormatOptions = DEFAULT_OPTIONS): string {
  const p = new Printer(options);
  p.printItems(doc.items, 0);
  p.printComments(doc.trailing, 0);
  return p.finish();
}

class Printer {
  private readonly opts: FormatOptions;
  private out = "";
  constructor(opts: FormatOptions) {
    this.opts = opts;
  }

  finish(): string {
    while (this.out.endsWith("\n\n")) this.out = this.out.slice(0, -1);
    if (this.out.length > 0 && !this.out.endsWith("\n")) this.out += "\n";
    return this.out;
  }

  private indent(depth: number): void {
    this.out += " ".repeat(depth * this.opts.indentWidth);
  }

  printItems(items: Item[], depth: number): void {
    for (const item of items) {
      const trivia = item.trivia ?? DEFAULT_TRIVIA;
      if (trivia.blankLineBefore) this.out += "\n";
      this.printComments(trivia.leading, depth);
      this.indent(depth);
      this.printItemKind(item, depth);
      if (trivia.trailing) {
        this.out += " " + renderComment(trivia.trailing);
      }
      this.out += "\n";
    }
  }

  printComments(comments: Comment[], depth: number): void {
    for (const c of comments) {
      this.indent(depth);
      this.out += renderComment(c);
      this.out += "\n";
    }
  }

  private printItemKind(item: Item, depth: number): void {
    switch (item.type) {
      case "leaf":
        this.out += item.key + " = ";
        this.printExprPrec(item.value, 0);
        break;
      case "node": {
        this.out += item.name;
        if (item.header) {
          this.out += " ";
          this.printHeader(item.header);
        }
        this.out += " {\n";
        this.printItems(item.body, depth + 1);
        this.indent(depth);
        this.out += "}";
        break;
      }
      case "vardef":
        this.out += "@" + item.name + " = ";
        this.printExprPrec(item.value, 0);
        break;
      case "include":
        this.out += "include ";
        this.printExprPrec(item.path, 0);
        break;
      case "if": {
        this.out += "if ";
        this.printExprPrec(item.cond, 0);
        this.out += " then\n";
        this.printItems(item.thenBody, depth + 1);
        for (const elif of item.elifs) {
          this.indent(depth);
          this.out += "elseif ";
          this.printExprPrec(elif.cond, 0);
          this.out += " then\n";
          this.printItems(elif.body, depth + 1);
        }
        if (item.elseBody) {
          this.indent(depth);
          this.out += "else\n";
          this.printItems(item.elseBody, depth + 1);
        }
        this.indent(depth);
        this.out += "end";
        break;
      }
      case "for": {
        this.out += "for " + item.varName + " = ";
        this.printExprPrec(item.start, 0);
        this.out += ", ";
        this.printExprPrec(item.stop, 0);
        if (item.step) {
          this.out += ", ";
          this.printExprPrec(item.step, 0);
        }
        this.out += " do\n";
        this.printItems(item.body, depth + 1);
        this.indent(depth);
        this.out += "end";
        break;
      }
      case "while":
        this.out += "while ";
        this.printExprPrec(item.cond, 0);
        this.out += " do\n";
        this.printItems(item.body, depth + 1);
        this.indent(depth);
        this.out += "end";
        break;
      case "local":
        this.out += "local " + item.name + " = ";
        this.printExprPrec(item.value, 0);
        break;
      case "return":
        this.out += "return";
        if (item.value) {
          this.out += " ";
          this.printExprPrec(item.value, 0);
        }
        break;
      case "fndef":
        this.out += "fn " + item.name + "(" + item.params.join(", ") + ") {\n";
        this.printItems(item.body, depth + 1);
        this.indent(depth);
        this.out += "}";
        break;
      case "exprstmt":
        this.printExprPrec(item.expr, 0);
        break;
      case "script":
        // Never reformatted -- printed byte-for-byte (scorium-spec §1/§4).
        this.out += "script {" + item.raw + "}";
        break;
    }
  }

  private printHeader(h: HeaderValue): void {
    if (h.kind === "bare") this.out += h.text;
    else this.out += '"' + escapeStr(h.text) + '"';
  }

  private printStrLit(lit: StrLit): void {
    if (lit.kind === "quoted") {
      this.out += '"' + escapeStr(lit.text) + '"';
      return;
    }
    for (const part of lit.parts) {
      this.out += part.kind === "lit" ? part.text : "$" + part.name;
    }
  }

  private printExprPrec(expr: Expr, minPrec: number): void {
    const prec = exprPrecedence(expr);
    const parenthesize = prec < minPrec;
    if (parenthesize) this.out += "(";
    switch (expr.type) {
      case "int":
        this.out += expr.value.toString();
        break;
      case "float":
        this.out += formatFloat(expr.value);
        break;
      case "bool":
        this.out += expr.value ? "true" : "false";
        break;
      case "nil":
        this.out += "nil";
        break;
      case "color":
        this.out += "#" + expr.hex;
        break;
      case "duration":
        this.out += formatDurationAmount(expr.amount) + expr.unit;
        break;
      case "str":
        this.printStrLit(expr.lit);
        break;
      case "list":
        this.out += "[";
        expr.items.forEach((item, i) => {
          if (i > 0) this.out += ", ";
          this.printExprPrec(item, 0);
        });
        this.out += "]";
        break;
      case "ident":
        this.out += expr.name;
        break;
      case "unary":
        this.out += expr.op === "neg" ? "-" : "not ";
        this.printExprPrec(expr.operand, PREC_UNARY);
        break;
      case "binary": {
        const opPrec = BINOP_PRECEDENCE[expr.op];
        this.printExprPrec(expr.left, opPrec);
        this.out += " " + BINOP_SYMBOL[expr.op] + " ";
        // Left-associative: the right operand needs strictly higher
        // precedence to preserve an explicitly grouped right-associated
        // expression like `a - (b - c)`, which is not `a - b - c`.
        this.printExprPrec(expr.right, opPrec + 1);
        break;
      }
      case "member":
        this.printExprPrec(expr.base, PREC_POSTFIX);
        this.out += "." + expr.field;
        break;
      case "call":
        this.printExprPrec(expr.callee, PREC_POSTFIX);
        this.out += "(";
        expr.args.forEach((arg, i) => {
          if (i > 0) this.out += ", ";
          this.printExprPrec(arg, 0);
        });
        this.out += ")";
        break;
    }
    if (parenthesize) this.out += ")";
  }
}

function exprPrecedence(expr: Expr): number {
  if (expr.type === "binary") return BINOP_PRECEDENCE[expr.op];
  if (expr.type === "unary") return PREC_UNARY;
  if (expr.type === "call" || expr.type === "member") return PREC_POSTFIX;
  return PREC_PRIMARY;
}

function renderComment(c: Comment): string {
  return c.block ? `--[[${c.text}]]` : `# ${c.text.trim()}`;
}

function escapeStr(s: string): string {
  let out = "";
  for (const c of s) {
    if (c === '"') out += '\\"';
    else if (c === "\\") out += "\\\\";
    else if (c === "\n") out += "\\n";
    else if (c === "\t") out += "\\t";
    else if (c === "\r") out += "\\r";
    else out += c;
  }
  return out;
}

/** Whole-number floats always print with an explicit decimal point (`1.0`, never `1`) so re-lexing produces a Float again, not an Int -- printing `1` would silently change the value's type. */
function formatFloat(n: number): string {
  if (Number.isFinite(n) && Number.isInteger(n)) return n.toFixed(1);
  return n.toString();
}

/** Durations don't have the Int/Float ambiguity: `600` and `600.0` both re-lex as the same duration literal, so the shorter form is used for a whole-number amount. */
function formatDurationAmount(n: number): string {
  if (Number.isFinite(n) && Number.isInteger(n)) return String(n);
  return n.toString();
}
