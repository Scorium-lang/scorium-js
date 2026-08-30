import { EvalError } from "./errors.ts";

/**
 * Scorium's eight value types (scorium-spec §2). `Int` is backed by
 * `bigint`, not `number` -- a `number` only represents integers exactly
 * through ±(2^53 - 1), narrower than the full 64-bit signed range §2
 * requires every implementation to represent exactly.
 */
export type Value =
  | { kind: "int"; value: bigint }
  | { kind: "float"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "nil" }
  | { kind: "string"; value: string }
  | { kind: "color"; r: number; g: number; b: number; a: number }
  | { kind: "duration"; amount: number; unit: "ms" | "s" | "m" }
  | { kind: "list"; value: Value[] };

const INT_MIN = -(2n ** 63n);
const INT_MAX = 2n ** 63n - 1n;

export function makeInt(value: bigint): Value {
  if (value < INT_MIN || value > INT_MAX) {
    throw new EvalError(`scorium::eval::arithmetic_overflow: ${value} is outside the 64-bit signed integer range`);
  }
  return { kind: "int", value };
}

export function colorToHex8(c: Extract<Value, { kind: "color" }>): string {
  const byte = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${byte(c.a)}`;
}

export function durationToString(d: Extract<Value, { kind: "duration" }>): string {
  const amount = Number.isInteger(d.amount) ? String(d.amount) : String(d.amount);
  return `${amount}${d.unit}`;
}
