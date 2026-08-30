import type { Entry } from "./entry.ts";
import { ScoriumError } from "./errors.ts";
import type { SourceFile, SourceSpan } from "./source.ts";
import type { Value } from "./value.ts";

export type DuplicateKeyPolicy = "error" | "last-wins" | "first-wins";
export type BuiltinValueType = "string" | "integer" | "float" | "boolean" | "color" | "duration" | "any";

export interface ListValueType {
  kind: "list";
  items: ValueType;
}

export interface CustomValueType {
  kind: "custom";
  name: string;
  /** Return true/undefined on success, false or a message on failure. */
  validate(value: Value): boolean | string | void;
}

export type ValueType = BuiltinValueType | ListValueType | CustomValueType;

export interface KeySchema {
  valueType: ValueType;
  required: boolean;
}

export type HeaderValidator = (header: string | null) => boolean | string | void;

export class NodeSchema {
  readonly keys: ReadonlyMap<string, KeySchema>;
  readonly children: ReadonlyMap<string, NodeSchema>;
  readonly allowUnknownKeys: boolean;
  readonly duplicateKeyPolicy: DuplicateKeyPolicy;
  readonly headerValidator: HeaderValidator | null;

  constructor(builder: NodeSchemaBuilder) {
    this.keys = new Map(builder.keys);
    this.children = new Map(builder.children);
    this.allowUnknownKeys = builder.allowUnknownKeysValue;
    this.duplicateKeyPolicy = builder.duplicateKeyPolicyValue;
    this.headerValidator = builder.headerValidatorValue;
  }

  static builder(): NodeSchemaBuilder {
    return new NodeSchemaBuilder();
  }
}

export class NodeSchemaBuilder {
  readonly keys = new Map<string, KeySchema>();
  readonly children = new Map<string, NodeSchema>();
  allowUnknownKeysValue = false;
  duplicateKeyPolicyValue: DuplicateKeyPolicy = "error";
  headerValidatorValue: HeaderValidator | null = null;

  key(name: string, valueType: ValueType): this {
    this.keys.set(name, { valueType, required: false });
    return this;
  }

  requiredKey(name: string, valueType: ValueType): this {
    this.keys.set(name, { valueType, required: true });
    return this;
  }

  node(name: string, schema: NodeSchema): this {
    this.children.set(name, schema);
    return this;
  }

  allowUnknownKeys(allow = true): this {
    this.allowUnknownKeysValue = allow;
    return this;
  }

  duplicateKeyPolicy(policy: DuplicateKeyPolicy): this {
    this.duplicateKeyPolicyValue = policy;
    return this;
  }

  header(validator: HeaderValidator): this {
    this.headerValidatorValue = validator;
    return this;
  }

  build(): NodeSchema {
    return new NodeSchema(this);
  }
}

export class Schema {
  readonly nodes: ReadonlyMap<string, NodeSchema>;
  readonly rootKeys: ReadonlyMap<string, KeySchema>;
  readonly allowUnknownNodes: boolean;

  constructor(builder: SchemaBuilder) {
    this.nodes = new Map(builder.nodes);
    this.rootKeys = new Map(builder.rootKeys);
    this.allowUnknownNodes = builder.allowUnknownNodesValue;
  }

  static builder(): SchemaBuilder {
    return new SchemaBuilder();
  }

  validate(entries: readonly Entry[], options: ValidateOptions = {}): ValidationResult {
    return validate(this, entries, options);
  }
}

export class SchemaBuilder {
  readonly nodes = new Map<string, NodeSchema>();
  readonly rootKeys = new Map<string, KeySchema>();
  allowUnknownNodesValue = false;

  node(name: string, schema: NodeSchema): this {
    this.nodes.set(name, schema);
    return this;
  }

  key(name: string, valueType: ValueType): this {
    this.rootKeys.set(name, { valueType, required: false });
    return this;
  }

  requiredKey(name: string, valueType: ValueType): this {
    this.rootKeys.set(name, { valueType, required: true });
    return this;
  }

  allowUnknownNodes(allow = true): this {
    this.allowUnknownNodesValue = allow;
    return this;
  }

  build(): Schema {
    return new Schema(this);
  }
}

export interface ValidateOptions {
  source?: SourceFile;
}

export class SchemaError extends ScoriumError {
  readonly suggestion: string | null;
  readonly node: string | null;
  readonly key: string | null;
  readonly firstSpan: SourceSpan | null;

  constructor(
    message: string,
    options: ValidateOptions & {
      span?: SourceSpan;
      suggestion?: string | null;
      node?: string | null;
      key?: string | null;
      firstSpan?: SourceSpan | null;
    } = {},
  ) {
    super(message, { source: options.source, span: options.span });
    this.suggestion = options.suggestion ?? null;
    this.node = options.node ?? null;
    this.key = options.key ?? null;
    this.firstSpan = options.firstSpan ?? null;
  }
}

export class ValidationResult {
  readonly errors: readonly SchemaError[];

  constructor(errors: readonly SchemaError[]) {
    this.errors = errors;
  }

  isValid(): boolean {
    return this.errors.length === 0;
  }
}

export function listOf(items: ValueType): ListValueType {
  return { kind: "list", items };
}

export function customType(name: string, validator: CustomValueType["validate"]): CustomValueType {
  return { kind: "custom", name, validate: validator };
}

export function validate(schema: Schema, entries: readonly Entry[], options: ValidateOptions = {}): ValidationResult {
  const errors: SchemaError[] = [];
  const rootSeen = new Map<string, SourceSpan | undefined>();
  const requiredSeen = new Set<string>();

  for (const entry of entries) {
    if (entry.kind === "node") {
      const nodeSchema = schema.nodes.get(entry.name);
      if (nodeSchema) validateNode(entry, nodeSchema, errors, options);
      else if (!schema.allowUnknownNodes) {
        errors.push(
          schemaError("scorium::schema::unknown_node", `unknown node \`${entry.name}\``, entry.span, options, {
            suggestion: suggest(entry.name, schema.nodes.keys()),
          }),
        );
      }
      continue;
    }
    if (entry.kind !== "leaf") continue;
    addDuplicateError(entry, rootSeen, errors, options, "error");
    requiredSeen.add(entry.key);
    const keySchema = schema.rootKeys.get(entry.key);
    if (!keySchema) {
      const suggestion = suggest(entry.key, schema.rootKeys.keys());
      errors.push(
        schemaError("scorium::schema::unknown_key", `unknown key \`${entry.key}\``, entry.span, options, {
          node: "<document>",
          key: entry.key,
          suggestion,
        }),
      );
    } else {
      validateType(entry, keySchema.valueType, errors, options);
    }
  }

  const documentSpan = entries[0]?.span ?? { start: 0, end: 1 };
  addMissingRequired(schema.rootKeys, requiredSeen, "<document>", documentSpan, errors, options);
  return new ValidationResult(errors);
}

function validateNode(
  node: Extract<Entry, { kind: "node" }>,
  schema: NodeSchema,
  errors: SchemaError[],
  options: ValidateOptions,
): void {
  if (schema.headerValidator) {
    const outcome = schema.headerValidator(node.header);
    if (outcome === false || typeof outcome === "string") {
      const message = typeof outcome === "string" ? outcome : "header was rejected";
      errors.push(
        schemaError(
          "scorium::schema::invalid_header",
          `invalid header for node \`${node.name}\`: ${message}`,
          node.span,
          options,
          { node: node.name },
        ),
      );
    }
  }

  const seen = new Map<string, SourceSpan | undefined>();
  const requiredSeen = new Set<string>();
  for (const child of node.children) {
    if (child.kind === "leaf") {
      addDuplicateError(child, seen, errors, options, schema.duplicateKeyPolicy);
      requiredSeen.add(child.key);
      const keySchema = schema.keys.get(child.key);
      if (keySchema) validateType(child, keySchema.valueType, errors, options);
      else if (!schema.allowUnknownKeys) {
        const suggestion = suggest(child.key, schema.keys.keys());
        errors.push(
          schemaError("scorium::schema::unknown_key", `unknown key \`${child.key}\``, child.span, options, {
            node: node.name,
            key: child.key,
            suggestion,
          }),
        );
      }
      continue;
    }
    if (child.kind !== "node") continue;
    const childSchema = schema.children.get(child.name);
    if (childSchema) validateNode(child, childSchema, errors, options);
    else {
      errors.push(
        schemaError("scorium::schema::unknown_node", `unknown node \`${child.name}\``, child.span, options, {
          suggestion: suggest(child.name, schema.children.keys()),
        }),
      );
    }
  }
  addMissingRequired(schema.keys, requiredSeen, node.name, node.span ?? { start: 0, end: 1 }, errors, options);
}

function validateType(
  entry: Extract<Entry, { kind: "leaf" }>,
  expected: ValueType,
  errors: SchemaError[],
  options: ValidateOptions,
): void {
  const message = checkType(expected, entry.value);
  if (!message) return;
  errors.push(
    schemaError("scorium::schema::wrong_type", `wrong type for \`${entry.key}\`: ${message}`, entry.span, options, {
      key: entry.key,
    }),
  );
}

function checkType(expected: ValueType, value: Value): string | null {
  if (typeof expected === "string") {
    if (expected === "any") return null;
    if (expected === "float" && (value.kind === "float" || value.kind === "int")) return null;
    const expectedKind = expected === "integer" ? "int" : expected === "boolean" ? "bool" : expected;
    return value.kind === expectedKind ? null : `expected ${expected}, found ${value.kind}`;
  }
  if (expected.kind === "list") {
    if (value.kind !== "list") return `expected ${typeName(expected)}, found ${value.kind}`;
    for (const item of value.value) {
      const message = checkType(expected.items, item);
      if (message) return message;
    }
    return null;
  }
  try {
    const outcome = expected.validate(value);
    if (outcome === false) return `expected ${expected.name}, found ${value.kind}`;
    return typeof outcome === "string" ? outcome : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function typeName(valueType: ValueType): string {
  if (typeof valueType === "string") return valueType;
  return valueType.kind === "list" ? `list of ${typeName(valueType.items)}` : valueType.name;
}

function addDuplicateError(
  entry: Extract<Entry, { kind: "leaf" }>,
  seen: Map<string, SourceSpan | undefined>,
  errors: SchemaError[],
  options: ValidateOptions,
  policy: DuplicateKeyPolicy,
): void {
  const firstSpan = seen.get(entry.key);
  if (seen.has(entry.key)) {
    if (policy === "error") {
      errors.push(
        schemaError("scorium::schema::duplicate_key", `duplicate key \`${entry.key}\``, entry.span, options, {
          key: entry.key,
          firstSpan: firstSpan ?? null,
        }),
      );
    }
  } else {
    seen.set(entry.key, entry.span);
  }
}

function addMissingRequired(
  keys: ReadonlyMap<string, KeySchema>,
  seen: Set<string>,
  node: string,
  span: SourceSpan,
  errors: SchemaError[],
  options: ValidateOptions,
): void {
  for (const [key, keySchema] of keys) {
    if (keySchema.required && !seen.has(key)) {
      errors.push(
        schemaError(
          "scorium::schema::missing_required_key",
          `missing required key \`${key}\` in \`${node}\``,
          span,
          options,
          { node, key },
        ),
      );
    }
  }
}

function schemaError(
  code: string,
  message: string,
  span: SourceSpan | undefined,
  options: ValidateOptions,
  details: { suggestion?: string | null; node?: string | null; key?: string | null; firstSpan?: SourceSpan | null } = {},
): SchemaError {
  return new SchemaError(`${code}: ${message}`, { ...options, ...details, span });
}

function suggest(name: string, candidates: Iterable<string>): string | null {
  let best: { candidate: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate);
    if (distance === 0 || distance > 2 || distance >= Math.max(name.length, candidate.length)) continue;
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  return best?.candidate ?? null;
}

function levenshtein(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let previousDiagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const previous = row[j]!;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(previous + 1, row[j - 1]! + 1, previousDiagonal + cost);
      previousDiagonal = previous;
    }
  }
  return row[right.length]!;
}
