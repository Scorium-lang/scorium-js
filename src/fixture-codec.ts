/**
 * Decodes scorium-spec's tagged-value conformance encoding
 * (conformance/README.md) into this package's native `Value`/`Entry`
 * types, and compares for fixture-assertion equality -- which is *not*
 * scorium-spec §2's runtime `==` (that makes NaN unequal to itself; a
 * fixture asserting "this evaluates to NaN" needs NaN-to-NaN to match).
 */
import type { Entry } from "./entry.ts";
import { makeInt, type Value } from "./value.ts";

export function decodeValue(json: any): Value {
  switch (json.type) {
    case "int":
      return makeInt(BigInt(json.value));
    case "float":
      return { kind: "float", value: decodeFloat(json.value) };
    case "bool":
      return { kind: "bool", value: json.value };
    case "nil":
      return { kind: "nil" };
    case "string":
      return { kind: "string", value: json.value };
    case "color": {
      const hex: string = json.value.replace(/^#/, "");
      const byte = (s: string) => parseInt(s, 16);
      return { kind: "color", r: byte(hex.slice(0, 2)), g: byte(hex.slice(2, 4)), b: byte(hex.slice(4, 6)), a: byte(hex.slice(6, 8)) };
    }
    case "duration": {
      const m = /^(-?\d+(?:\.\d+)?)(ms|s|m)$/.exec(json.value);
      if (!m) throw new Error(`bad fixture duration: ${json.value}`);
      return { kind: "duration", amount: Number(m[1]), unit: m[2] as "ms" | "s" | "m" };
    }
    case "list":
      return { kind: "list", value: json.value.map(decodeValue) };
    default:
      throw new Error(`unknown fixture value tag: ${json.type}`);
  }
}

function decodeFloat(token: string): number {
  if (token === "nan") return NaN;
  if (token === "inf") return Infinity;
  if (token === "-inf") return -Infinity;
  return Number(token);
}

export function decodeEntries(json: any): Entry[] {
  if (json.type !== "entries") throw new Error(`expected an "entries" fixture value, got ${json.type}`);
  return json.value.map(decodeEntry);
}

function decodeEntry(json: any): Entry {
  if (json.kind === "leaf") return { kind: "leaf", key: json.key, value: decodeValue(json.value) };
  if (json.kind === "node") return { kind: "node", name: json.name, header: json.header, children: json.children.map(decodeEntry) };
  if (json.kind === "include") return { kind: "include", path: json.path };
  throw new Error(`unknown fixture entry kind: ${json.kind}`);
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "int":
      return a.value === (b as typeof a).value;
    case "float": {
      const bv = (b as typeof a).value;
      if (Number.isNaN(a.value) && Number.isNaN(bv)) return true; // fixture equality, not section 2's `==`
      return a.value === bv;
    }
    case "bool":
      return a.value === (b as typeof a).value;
    case "nil":
      return true;
    case "string":
      return a.value === (b as typeof a).value;
    case "color": {
      const bc = b as typeof a;
      return a.r === bc.r && a.g === bc.g && a.b === bc.b && a.a === bc.a;
    }
    case "duration": {
      const bd = b as typeof a;
      return a.amount === bd.amount && a.unit === bd.unit;
    }
    case "list": {
      const bl = (b as typeof a).value;
      return a.value.length === bl.length && a.value.every((v, i) => valuesEqual(v, bl[i]!));
    }
  }
}

export function entriesEqual(a: Entry[], b: Entry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((e, i) => entryEqual(e, b[i]!));
}

function entryEqual(a: Entry, b: Entry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "leaf" && b.kind === "leaf") return a.key === b.key && valuesEqual(a.value, b.value);
  if (a.kind === "node" && b.kind === "node") {
    return a.name === b.name && a.header === b.header && entriesEqual(a.children, b.children);
  }
  if (a.kind === "include" && b.kind === "include") return a.path === b.path;
  return false;
}
