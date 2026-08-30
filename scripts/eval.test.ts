import assert from "node:assert/strict";
import test from "node:test";
import { EvalError, evaluate } from "../src/eval.ts";
import { parse } from "../src/parser.ts";

test("return outside a function is rejected", () => {
  assert.throws(
    () => evaluate(parse("return 1")),
    (error) => error instanceof EvalError && error.code === "scorium::eval::return_outside_function",
  );
});

test("return propagates through a nested node body", () => {
  const entries = evaluate(
    parse(`fn choose() {
    wrapper {
        return 7
    }
    return 9
}
answer = choose()`),
  );

  assert.deepEqual(entries, [{ kind: "leaf", key: "answer", value: { kind: "int", value: 7n } }]);
});
