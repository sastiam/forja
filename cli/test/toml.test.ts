import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, stringify, TomlError } from "../src/core/toml.ts";

test("parsea tablas, strings, bools, enteros y arrays multilínea", () => {
  const t = parse(`
# comentario
name = "forja"   # inline
n = 3
ok = true
list = [
  "a", # uno
  'b',
]
[a.b]
k = "v\\n"
`);
  assert.deepEqual(t, { name: "forja", n: 3, ok: true, list: ["a", "b"], a: { b: { k: "v\n" } } });
});

test("rechaza claves duplicadas y sintaxis no soportada", () => {
  assert.throws(() => parse("a = 1\na = 2"), TomlError);
  assert.throws(() => parse("[[x]]\na = 1"), TomlError);
  assert.throws(() => parse('a = "sin cerrar'), TomlError);
});

test("stringify → parse es un round-trip", () => {
  const t = {
    schema: 1,
    host: "m",
    list: ["x", "y"],
    id: { name: "N", email: "e@example.invalid" },
    p: { w: { enabled: true } },
  };
  assert.deepEqual(parse(stringify(t)), t);
});
