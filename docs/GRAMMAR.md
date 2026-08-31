# Scorium Grammar

This document summarizes the grammar accepted by `scorium-js` for Scorium
stable language version `0.2.1`. The normative grammar belongs to the
separate `scorium-spec` project. If this guide, the implementation, and the
spec disagree, the discrepancy must be fixed explicitly; the spec is the
language authority.

The notation is EBNF-like: `{ x }` means zero or more, `[ x ]` means
optional, and `|` separates alternatives.

## Lexical structure

Spaces, tabs, and newlines separate tokens. Scorium is newline-sensitive at
the statement level.

```ebnf
comment       ::= line_comment | block_comment
line_comment  ::= '#' rest_of_line | '--' rest_of_line
block_comment ::= '--[[' ... ']]'

ident          ::= ident_start { ident_continue }
ident_start    ::= letter | '_'
ident_continue ::= letter | digit | '_' | '-'
vardef         ::= '@' ident
interp         ::= '$' ident
```

Block comments do not nest. `#` begins a color when a value is expected and
a comment otherwise.

### Literals

```ebnf
int        ::= digit { digit }
float      ::= digit { digit } '.' digit { digit } | '.' digit { digit }
bool       ::= 'true' | 'false'
nil        ::= 'nil'
color      ::= '#' hex hex hex hex hex hex [ hex hex ]
duration   ::= number ( 'ms' | 's' | 'm' )
quoted_str ::= '"' { char | escape } '"'
escape     ::= '\\' ( '"' | '\\' | 'n' | 't' | 'r' )
```

Binary operators require whitespace on both sides.

## Documents and items

```ebnf
document ::= { item } { comment }

item ::= leaf | node | vardef_stmt | include | if_stmt | for_stmt
       | while_stmt | local_stmt | return_stmt | fn_def | script_block
       | call_stmt

leaf   ::= ident '=' expr
node   ::= ident [ header ] '{' newline { item } '}'
header ::= bare_value | quoted_str

vardef_stmt ::= '@' ident '=' expr
local_stmt  ::= 'local' ident '=' expr
include     ::= 'include' string_literal
```

A node header is one bare token or quoted string. Its meaning is host-defined.

## Control flow and functions

```ebnf
if_stmt ::= 'if' expr 'then' newline { item }
            { 'elseif' expr 'then' newline { item } }
            [ 'else' newline { item } ]
            'end'

for_stmt   ::= 'for' ident '=' expr ',' expr [ ',' expr ] 'do'
               newline { item } 'end'
while_stmt ::= 'while' expr 'do' newline { item } 'end'
return_stmt ::= 'return' [ expr ]

fn_def ::= 'fn' ident '(' [ ident { ',' ident } ] ')'
           '{' newline { item } '}'
call_stmt ::= call
```

The numeric `for` range includes both endpoints. Its default step is `1`,
and step `0` is a type error.

`return` is valid only while a Scorium function is executing. Outside a
function it raises `scorium::eval::return_outside_function`; inside nested
control flow or a node body it exits the surrounding function.

## Script blocks

```ebnf
script_block ::= 'script' '{' raw_lua_text '}'
```

The lexer captures the body as raw text. `scorium-js` parses and formats
this production but does not execute it; evaluation reports
`scorium::eval::script_error`.

## Expressions

```ebnf
expr       ::= or_expr
or_expr    ::= and_expr { 'or' and_expr }
and_expr   ::= cmp_expr { 'and' cmp_expr }
cmp_expr   ::= add_expr [ rel_op add_expr ]
add_expr   ::= mul_expr { ( '+' | '-' ) mul_expr }
mul_expr   ::= unary { ( '*' | '/' | '%' ) unary }
unary      ::= ( '-' | 'not' ) postfix | postfix
postfix    ::= primary { call_suffix | member_suffix }
call_suffix   ::= '(' [ expr { ',' expr } ] ')'
member_suffix ::= '.' ident

primary ::= int | float | bool | nil | color | duration | quoted_str
          | bare_str | list | '(' expr ')' | ident
list    ::= '[' [ expr { ',' expr } ] ']'
```

Comparison operators are `==`, `~=`, `<`, `>`, `<=`, and `>=`.

Quoted strings are literal. Bare strings may contain `$name`
interpolations. Plain identifiers resolve according to the five-step order
documented in [LANGUAGE.md](./LANGUAGE.md#calls-methods-and-identifier-resolution).

## Reserved words

```text
if  then  elseif  else  end
for  do  while
fn  local  return  nil  true  false
and  or  not
include  script
```

## Implemented and deferred

`scorium-js` implements the complete grammar above, including member calls,
comments, includes, and raw script preservation. Script execution is the
only parsed language surface not evaluated.

The current raw-script scanner counts braces but does not interpret Lua
string or comment syntax. A brace inside a Lua string/comment can therefore
end or extend the captured block incorrectly. This does not affect ordinary
Scorium syntax, and script execution remains unavailable, but the parser gap
must be fixed before claiming complete raw-Lua lexical compatibility.

The following are outside language version `0.2.1`:

- host-pluggable lexer syntax;
- generic `for` over tables or iterators;
- a `.scor` schema language;
- string escapes beyond `\"`, `\\`, `\n`, `\t`, and `\r`;
- nested block comments;
- preservation of comments inside expressions and lists.
