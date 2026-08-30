import type { Value } from "./value.ts";
import type { SourceSpan } from "./source.ts";

/**
 * The evaluated configuration tree (scorium-spec conformance/README.md's
 * `entries` shape; mirrors scorium-rust's `Entry`). Deliberately an
 * ordered array, never a map -- the same node name can repeat, and a
 * node carries an optional header neither of which a plain object could
 * represent.
 */
export type Entry =
  | { kind: "leaf"; key: string; value: Value; span?: SourceSpan }
  | { kind: "node"; name: string; header: string | null; children: Entry[]; span?: SourceSpan }
  | { kind: "include"; path: string; span?: SourceSpan }
  /**
   * A standalone call to a *host*-registered function (not a Scorium
   * `fn`), used as a full statement rather than part of an assignment --
   * matches scorium-rust's `Entry::HostCall`. Host-integration entries
   * are outside the `0.2.0` conformance corpus's scope (see
   * scorium-spec's `conformance/README.md`), so this is an implementation
   * capability, not conformance-mandated behavior.
   */
  | { kind: "hostCall"; name: string; args: Value[]; result: Value; span?: SourceSpan };
