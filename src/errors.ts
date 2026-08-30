/**
 * Base for every Scorium error: exposes `.code` (the `scorium::*`
 * diagnostic code) as a real, catchable field -- scorium-spec §5's
 * codes-are-the-contract, message-text-isn't. Extracted from the
 * existing `"scorium::stage::name: message"` convention every throw
 * site already follows, so no call site needs to change.
 */
export class ScoriumError extends Error {
  readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = "ScoriumError";
    const m = /^(scorium::[a-z0-9_]+::[a-z0-9_]+)/.exec(message);
    this.code = m ? m[1]! : "";
  }
}

export class LexError extends ScoriumError {}
export class ParseError extends ScoriumError {}
export class EvalError extends ScoriumError {}
