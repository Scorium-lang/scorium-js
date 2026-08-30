/** A half-open UTF-16 source range, matching JavaScript string offsets. */
export interface SourceSpan {
  start: number;
  end: number;
}

/** Source text retained by a parsed document for diagnostics and tooling. */
export interface SourceFile {
  name: string;
  text: string;
}

export interface SourceLocation {
  offset: number;
  line: number;
  column: number;
}

export function locationAt(source: string, offset: number): SourceLocation {
  const bounded = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < bounded; index++) {
    if (source.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }
  return { offset: bounded, line, column: bounded - lineStart + 1 };
}
