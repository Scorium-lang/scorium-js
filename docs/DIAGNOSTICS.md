# Diagnostics

Scorium diagnostic codes are the cross-language contract. Every code is
namespaced as `scorium::<stage>::<name>`:

```text
scorium::lex::*     lexer
scorium::parse::*   parser
scorium::eval::*    evaluator
scorium::schema::*  schema validation (not provided by scorium-js)
```

`scorium-js` errors extend `ScoriumError` and expose a catchable `.code`
field. Message text is informative, not a stable machine interface.

```ts
import { EvalError, evaluate, parse } from "scorium";

try {
  evaluate(parse("answer = 1 / 0"));
} catch (error) {
  if (
    error instanceof EvalError &&
    error.code === "scorium::eval::division_by_zero"
  ) {
    // Recover or present an application-specific message.
  }
}
```

## Lexer (`scorium::lex`)

| Code | Meaning |
| --- | --- |
| `scorium::lex::unexpected_char` | A character cannot start a token here. |
| `scorium::lex::unterminated_string` | A quoted string has no closing quote. |
| `scorium::lex::unterminated_comment` | A block comment has no closing `]]`. |
| `scorium::lex::squeezed_operator` | A binary operator lacks required surrounding spaces. |

## Parser (`scorium::parse`)

| Code | Meaning |
| --- | --- |
| `scorium::parse::unexpected_token` | The current token cannot continue the construct. |
| `scorium::parse::at_in_expression` | `@name` appears in an expression; use `name`. |
| `scorium::parse::dollar_in_expression` | `$name` appears as an expression operand; use `name`. |
| `scorium::parse::unexpected_eof` | Input ended before a construct was complete. |

`scorium::parse::reserved_word` is part of the language code catalog. The
current JS parser generally reaches `unexpected_token` first for this case;
aligning that edge case remains implementation work.

## Evaluator (`scorium::eval`)

| Code | Meaning |
| --- | --- |
| `scorium::eval::undefined_interpolation` | `$name` has no matching definition. |
| `scorium::eval::unknown_function` | Neither a Scorium function nor host function exists. |
| `scorium::eval::type_error` | An operand, call, method, or include path has the wrong type. |
| `scorium::eval::division_by_zero` | Division or modulo uses a zero divisor. |
| `scorium::eval::arithmetic_overflow` | Integer arithmetic leaves the signed 64-bit range. |
| `scorium::eval::includes_disabled` | The host disabled `include`. |
| `scorium::eval::include_path_denied` | The host path policy rejected an include. |
| `scorium::eval::include_cycle` | The include chain returns to an active file. |
| `scorium::eval::include_io` | An included file cannot be read. |
| `scorium::eval::include_parse` | An included file cannot be parsed. |
| `scorium::eval::script_error` | Script execution was requested; this package has no Lua VM. |
| `scorium::eval::loop_budget_exceeded` | The evaluation exceeded its loop budget. |
| `scorium::eval::call_depth_exceeded` | Scorium function nesting exceeded its limit. |

## Error classes

| Class | Sources |
| --- | --- |
| `ScoriumError` | Base class for all package diagnostics |
| `LexError` | Tokenization |
| `ParseError` | Parsing |
| `EvalError` | Evaluation, includes, host calls, and resource limits |

Today the public error contract is `.code` plus the human-readable
`.message`. Some messages contain a source offset, but there is not yet a
uniform exported span/line/column structure or graphical renderer. Consumers
should not parse locations from message text.
