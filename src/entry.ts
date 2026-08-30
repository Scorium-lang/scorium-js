import type { Value } from "./value.ts";

/**
 * The evaluated configuration tree (scorium-spec conformance/README.md's
 * `entries` shape; mirrors scorium-rust's `Entry`). Deliberately an
 * ordered array, never a map -- the same node name can repeat, and a
 * node carries an optional header neither of which a plain object could
 * represent.
 */
export type Entry =
  | { kind: "leaf"; key: string; value: Value }
  | { kind: "node"; name: string; header: string | null; children: Entry[] }
  | { kind: "include"; path: string };
