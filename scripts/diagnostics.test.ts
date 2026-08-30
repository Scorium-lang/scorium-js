import assert from "node:assert/strict";
import test from "node:test";

import { EvalError, LexError, evaluate, parse } from "../src/index.ts";

test("lexer diagnostics expose source spans and line/column locations", () => {
  assert.throws(
    () => parse("ok = 1\nbad = 2*3", { sourceName: "config.scor" }),
    (error: unknown) => {
      assert.ok(error instanceof LexError);
      assert.equal(error.code, "scorium::lex::squeezed_operator");
      assert.equal(error.sourceName, "config.scor");
      assert.deepEqual(error.location, { offset: 14, line: 2, column: 8 });
      assert.match(error.format(), /^config\.scor:2:8/m);
      assert.match(error.format(), /bad = 2\*3\n {7}\^/);
      return true;
    },
  );
});

test("evaluation diagnostics inherit the exact source item span", () => {
  const document = parse("good = true\nbad = missing()", { sourceName: "runtime.scor" });
  assert.throws(
    () => evaluate(document),
    (error: unknown) => {
      assert.ok(error instanceof EvalError);
      assert.equal(error.code, "scorium::eval::unknown_function");
      assert.equal(error.sourceName, "runtime.scor");
      assert.equal(error.location?.line, 2);
      assert.equal(error.location?.column, 1);
      assert.match(error.format(), /runtime\.scor:2:1/);
      return true;
    },
  );
});

test("evaluated entries retain their declaration spans", () => {
  const entries = evaluate(parse("port = 8080", { sourceName: "server.scor" }));
  assert.deepEqual(entries[0]?.span, { start: 0, end: 11 });
});
