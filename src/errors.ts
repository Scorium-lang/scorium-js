import { locationAt, type SourceFile, type SourceLocation, type SourceSpan } from "./source.ts";

export interface DiagnosticContext {
  source?: SourceFile;
  span?: SourceSpan;
}

/**
 * Base for every Scorium error: exposes `.code` (the `scorium::*`
 * diagnostic code) as a real, catchable field -- scorium-spec §5's
 * codes-are-the-contract, message-text-isn't. Extracted from the
 * existing `"scorium::stage::name: message"` convention every throw
 * site already follows, so no call site needs to change.
 */
export class ScoriumError extends Error {
  readonly code: string;
  sourceName: string | null;
  span: SourceSpan | null;
  location: SourceLocation | null;
  endLocation: SourceLocation | null;
  private sourceText: string | null;

  constructor(message: string, context: DiagnosticContext = {}) {
    super(message);
    this.name = new.target.name;
    const m = /^(scorium::[a-z0-9_]+::[a-z0-9_]+)/.exec(message);
    this.code = m ? m[1]! : "";
    this.sourceName = null;
    this.span = null;
    this.location = null;
    this.endLocation = null;
    this.sourceText = null;
    this.attachContext(context);
  }

  /** Adds source information at the layer that knows it, without replacing a more precise inner diagnostic. */
  attachContext(context: DiagnosticContext): this {
    if (this.span || !context.span) return this;
    if (!context.source) {
      this.span = { ...context.span };
      return this;
    }
    this.sourceName = context.source.name;
    this.sourceText = context.source.text;
    this.span = {
      start: Math.max(0, Math.min(context.span.start, context.source.text.length)),
      end: Math.max(context.span.start, Math.min(context.span.end, context.source.text.length)),
    };
    this.location = locationAt(context.source.text, this.span.start);
    this.endLocation = locationAt(context.source.text, this.span.end);
    return this;
  }

  /** Human-readable path/line/column diagnostic with a source excerpt and underline. */
  format(): string {
    if (!this.sourceText || !this.span || !this.location) return this.message;
    const lines = this.sourceText.split(/\r?\n/);
    const lineText = lines[this.location.line - 1] ?? "";
    const width = Math.max(1, Math.min(this.span.end - this.span.start, Math.max(1, lineText.length - this.location.column + 1)));
    const marker = `${" ".repeat(Math.max(0, this.location.column - 1))}${"^".repeat(width)}`;
    return `${this.sourceName ?? "<input>"}:${this.location.line}:${this.location.column}\n${this.message}\n${lineText}\n${marker}`;
  }
}

export class LexError extends ScoriumError {}
export class ParseError extends ScoriumError {}
export class EvalError extends ScoriumError {}
