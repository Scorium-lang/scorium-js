/**
 * A complete embedding of Scorium: parse a source string, evaluate it
 * against a host runtime that registers a value and a function, validate
 * the result against a schema, and inspect the evaluated tree.
 *
 * Run it with:
 *
 * ```text
 * node examples/embedding/main.ts
 * ```
 *
 * This mirrors what a real embedding application does -- only the host
 * function and schema are toy ones. See `docs/EMBEDDING.md` for the full
 * API surface. Mirrors `scorium-rs`'s `examples/embedding/src/main.rs`.
 */
import { NodeSchema, Schema, ScoriumError, evaluate, format, parse } from "../../src/index.ts";
import type { Value } from "../../src/index.ts";

// `environment` is a host-registered value and `double` is a host-registered
// function (see below) -- both reach expressions through the same registry.
const CONFIG = `
@base_port = 8000

server {
    host = localhost
    port = double(base_port)
    timeout = 5s
    enabled = environment == production
}
`;

function main(): void {
  // 1. Parse: source text -> AST.
  let doc;
  try {
    doc = parse(CONFIG, { sourceName: "<embedding-example>" });
  } catch (error) {
    if (error instanceof ScoriumError) console.error(error.format());
    else console.error(error);
    process.exitCode = 1;
    return;
  }

  // 2. Evaluate: AST -> typed entry tree, with host capabilities registered.
  //    `double` mirrors scorium-rust's example exactly (int or float, doubled).
  const entries = evaluate(doc, {
    hostValues: { environment: { kind: "string", value: "production" } },
    hostFunctions: {
      double(args: Value[]): Value {
        const arg = args[0];
        if (arg?.kind === "int") return { kind: "int", value: arg.value * 2n };
        if (arg?.kind === "float") return { kind: "float", value: arg.value * 2 };
        throw new Error("double() expects one number");
      },
    },
  });

  // 3. Validate against a schema the host application defines.
  const schema = Schema.builder()
    .node(
      "server",
      NodeSchema.builder()
        .requiredKey("host", "string")
        .requiredKey("port", "integer")
        .key("timeout", "duration")
        .key("enabled", "boolean")
        .build(),
    )
    .build();

  const result = schema.validate(entries);
  if (result.isValid()) {
    console.log("configuration is valid");
  } else {
    for (const error of result.errors) console.error(error.format());
  }

  // 4. Inspect the evaluated tree. This is where a host would apply the
  //    configuration; here we just print it.
  console.log("evaluated entries:");
  console.log(JSON.stringify(entries, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2));

  // 5. The canonical formatter is available too, byte-identical across
  //    every conforming Scorium implementation for the same input.
  console.log("canonical formatting:");
  console.log(format(doc));
}

main();
