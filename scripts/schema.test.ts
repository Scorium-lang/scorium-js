import assert from "node:assert/strict";
import test from "node:test";

import { evaluate } from "../src/eval.ts";
import { parse } from "../src/parser.ts";
import { NodeSchema, Schema, listOf } from "../src/schema.ts";

test("a document matching the schema validates with no errors", () => {
  const schema = Schema.builder()
    .requiredKey("name", "string")
    .key("tags", listOf("string"))
    .node(
      "server",
      NodeSchema.builder().requiredKey("port", "integer").key("host", "string").build(),
    )
    .build();

  const entries = evaluate(parse('name = "demo"\ntags = ["a", "b"]\nserver {\n  port = 8080\n}'));
  const result = schema.validate(entries);

  assert.equal(result.isValid(), true);
  assert.deepEqual(result.errors, []);
});

test("an unknown key is reported with scorium::schema::unknown_key", () => {
  const schema = Schema.builder().requiredKey("name", "string").build();
  const entries = evaluate(parse('name = "demo"\nextra = 1'));
  const result = schema.validate(entries);

  assert.equal(result.isValid(), false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "scorium::schema::unknown_key");
});

test("a missing required key is reported with scorium::schema::missing_required_key", () => {
  const schema = Schema.builder().requiredKey("name", "string").build();
  const entries = evaluate(parse("other = 1"));
  const result = schema.validate(entries, {});

  assert.equal(result.errors.some((e) => e.code === "scorium::schema::missing_required_key"), true);
});

test("a wrong-typed value is reported with scorium::schema::wrong_type", () => {
  const schema = Schema.builder().requiredKey("port", "integer").build();
  const entries = evaluate(parse('port = "not a number"'));
  const result = schema.validate(entries);

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "scorium::schema::wrong_type");
});

test("an unknown key with a close match gets a suggestion", () => {
  const schema = Schema.builder().requiredKey("name", "string").build();
  const entries = evaluate(parse('nam = "demo"'));
  const result = schema.validate(entries);

  assert.equal(result.errors[0]?.suggestion, "name");
});

test("float accepts an int value, matching Rust's numeric-widening rule", () => {
  const schema = Schema.builder().requiredKey("ratio", "float").build();
  const entries = evaluate(parse("ratio = 1"));
  const result = schema.validate(entries);

  assert.equal(result.isValid(), true);
});
