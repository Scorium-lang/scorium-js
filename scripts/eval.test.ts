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

  assert.equal(entries.length, 1);
  const answer = entries[0];
  assert.equal(answer?.kind, "leaf");
  if (answer?.kind !== "leaf") throw new Error("expected answer leaf");
  assert.equal(answer.key, "answer");
  assert.deepEqual(answer.value, { kind: "int", value: 7n });
  assert.ok(answer.span);
});

test("a standalone host-function call emits a hostCall entry, matching scorium-rust", () => {
  const entries = evaluate(parse('log("hi", 1)'), {
    hostFunctions: {
      log: (args) => ({ kind: "string", value: `logged ${args.length} args` }),
    },
  });

  assert.equal(entries.length, 1);
  const call = entries[0];
  assert.equal(call?.kind, "hostCall");
  if (call?.kind !== "hostCall") throw new Error("expected hostCall entry");
  assert.equal(call.name, "log");
  assert.deepEqual(call.args, [
    { kind: "string", value: "hi" },
    { kind: "int", value: 1n },
  ]);
  assert.deepEqual(call.result, { kind: "string", value: "logged 2 args" });
});

test("a standalone call to a Scorium fn emits no hostCall entry, only what the fn body emits", () => {
  const entries = evaluate(
    parse(`fn announce() {
    said = true
}
announce()`),
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, "leaf");
});
