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

test("a custom includeResolver reads from a non-filesystem source", () => {
  const docs: Record<string, string> = { child: "value = 1\n" };
  const entries = evaluate(parse('include "child"\n'), {
    includeResolver: {
      resolve: (_base, path) => {
        if (!(path in docs)) throw new Error(`no such virtual document \`${path}\``);
        return { key: path, base: path };
      },
      load: (key) => docs[key]!,
    },
  });

  assert.equal(entries.length, 2);
  const value = entries[1];
  assert.equal(value?.kind, "leaf");
  if (value?.kind !== "leaf") throw new Error("expected value leaf");
  assert.deepEqual(value.value, { kind: "int", value: 1n });
});

test("includeResolver denial is scorium::eval::include_path_denied", () => {
  assert.throws(
    () =>
      evaluate(parse('include "missing"\n'), {
        includeResolver: {
          resolve: () => {
            throw new Error("denied");
          },
          load: () => "",
        },
      }),
    (error) => error instanceof EvalError && error.code === "scorium::eval::include_path_denied",
  );
});

test("includeResolver cycle is scorium::eval::include_cycle", () => {
  const docs: Record<string, string> = { a: 'include "a"\n' };
  assert.throws(
    () =>
      evaluate(parse('include "a"\n'), {
        includeResolver: {
          resolve: (_base, path) => ({ key: path, base: path }),
          load: (key) => docs[key]!,
        },
      }),
    (error) => error instanceof EvalError && error.code === "scorium::eval::include_cycle",
  );
});
