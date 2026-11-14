// Parser TOML mínimo (subconjunto) para evitar dependencias de runtime. Ver docs/adr/0003.
// Soporta: tablas [a.b], claves simples/entrecomilladas, strings ("…" con escapes y '…'),
// enteros, flotantes, booleanos y arrays (multilínea, anidados, con comentarios).
// No soporta: arrays de tablas [[x]], tablas inline, fechas, strings multilínea.

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export interface TomlTable {
  [key: string]: TomlValue;
}

export class TomlError extends Error {}

class Cursor {
  src: string;
  i = 0;
  constructor(src: string) {
    this.src = src;
  }
  get line(): number {
    return this.src.slice(0, this.i).split("\n").length;
  }
  fail(msg: string): never {
    throw new TomlError(`TOML línea ${this.line}: ${msg}`);
  }
  peek(): string {
    return this.src[this.i] ?? "";
  }
  eof(): boolean {
    return this.i >= this.src.length;
  }
  skipInline(): void {
    while (this.peek() === " " || this.peek() === "\t") this.i++;
  }
  skipComment(): void {
    if (this.peek() === "#") while (!this.eof() && this.peek() !== "\n") this.i++;
  }
  skipAll(): void {
    for (;;) {
      this.skipInline();
      this.skipComment();
      const c = this.peek();
      if (c === "\n" || c === "\r") this.i++;
      else return;
    }
  }
}

const ESC: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  '"': '"',
  "\\": "\\",
  b: "\b",
  f: "\f",
};

function parseString(c: Cursor): string {
  const q = c.peek();
  c.i++;
  let out = "";
  for (;;) {
    if (c.eof() || c.peek() === "\n") c.fail("string sin cerrar");
    const ch = c.peek();
    c.i++;
    if (ch === q) return out;
    if (q === '"' && ch === "\\") {
      const e = c.peek();
      c.i++;
      if (e === "u") {
        out += String.fromCodePoint(Number.parseInt(c.src.slice(c.i, c.i + 4), 16));
        c.i += 4;
      } else if (e in ESC) out += ESC[e];
      else c.fail(`escape inválido \\${e}`);
    } else out += ch;
  }
}

function parseValue(c: Cursor): TomlValue {
  c.skipInline();
  const ch = c.peek();
  if (ch === '"' || ch === "'") return parseString(c);
  if (ch === "[") {
    c.i++;
    const arr: TomlValue[] = [];
    for (;;) {
      c.skipAll();
      if (c.peek() === "]") {
        c.i++;
        return arr;
      }
      arr.push(parseValue(c));
      c.skipAll();
      if (c.peek() === ",") c.i++;
      else if (c.peek() !== "]") c.fail("se esperaba , o ]");
    }
  }
  const m = /^[^\s,\]#]+/.exec(c.src.slice(c.i));
  if (!m) c.fail("valor vacío");
  const tok = m[0];
  c.i += tok.length;
  if (tok === "true") return true;
  if (tok === "false") return false;
  if (/^[+-]?\d[\d_]*$/.test(tok)) return Number.parseInt(tok.replaceAll("_", ""), 10);
  if (/^[+-]?\d[\d_]*\.\d+([eE][+-]?\d+)?$/.test(tok))
    return Number.parseFloat(tok.replaceAll("_", ""));
  return c.fail(`valor no soportado: ${tok}`);
}

function parseKeyPath(c: Cursor, terminators: string): string[] {
  const parts: string[] = [];
  for (;;) {
    c.skipInline();
    const ch = c.peek();
    if (ch === '"' || ch === "'") parts.push(parseString(c));
    else {
      const m = /^[A-Za-z0-9_-]+/.exec(c.src.slice(c.i));
      if (!m) c.fail("clave inválida");
      parts.push(m[0]);
      c.i += m[0].length;
    }
    c.skipInline();
    if (c.peek() === ".") {
      c.i++;
      continue;
    }
    if (terminators.includes(c.peek())) return parts;
    c.fail("clave inválida");
  }
}

function descend(root: TomlTable, path: string[], c: Cursor): TomlTable {
  let t = root;
  for (const k of path) {
    const next = t[k];
    if (next === undefined) {
      const nt: TomlTable = {};
      t[k] = nt;
      t = nt;
    } else if (typeof next === "object" && !Array.isArray(next)) t = next;
    else c.fail(`la clave ${k} no es una tabla`);
  }
  return t;
}

export function parse(src: string): TomlTable {
  const c = new Cursor(src);
  const root: TomlTable = {};
  let cur = root;
  for (;;) {
    c.skipAll();
    if (c.eof()) return root;
    if (c.peek() === "[") {
      if (c.src[c.i + 1] === "[") c.fail("arrays de tablas no soportados");
      c.i++;
      const path = parseKeyPath(c, "]");
      c.i++; // ]
      cur = descend(root, path, c);
    } else {
      const path = parseKeyPath(c, "=");
      c.i++; // =
      const value = parseValue(c);
      const last = path[path.length - 1] as string;
      const parent = descend(cur, path.slice(0, -1), c);
      if (last in parent) c.fail(`clave duplicada ${last}`);
      parent[last] = value;
    }
    c.skipInline();
    c.skipComment();
    if (!c.eof() && c.peek() !== "\n" && c.peek() !== "\r")
      c.fail("texto inesperado tras el valor");
  }
}

function scalar(v: TomlValue): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(scalar).join(", ")}]`;
  return String(v);
}

function emit(t: TomlTable, prefix: string[], lines: string[]): void {
  const tables: [string, TomlTable][] = [];
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "object" && !Array.isArray(v)) tables.push([k, v]);
    else lines.push(`${/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k)} = ${scalar(v)}`);
  }
  for (const [k, v] of tables) {
    lines.push("", `[${[...prefix, k].join(".")}]`);
    emit(v, [...prefix, k], lines);
  }
}

export function stringify(t: TomlTable): string {
  const lines: string[] = [];
  emit(t, [], lines);
  return `${lines.join("\n").replace(/^\n/, "")}\n`;
}
