import assert from "node:assert/strict";
import { test } from "node:test";
import { enabledModuleNames } from "../src/core/hosts.ts";
import {
  DependencyError,
  loadModules,
  type Module,
  parseModule,
  resolveOrder,
} from "../src/core/modules.ts";
import { repoRoot } from "../src/core/paths.ts";

const mod = (name: string, depends: string[] = []): Module =>
  parseModule(
    name,
    "/nonexistent",
    `name = "${name}"\ndepends = [${depends.map((d) => `"${d}"`).join(",")}]\n`,
  );
const set = (...ms: Module[]) => new Map(ms.map((m) => [m.name, m]));

test("orden topológico: dependencias primero y sin duplicados", () => {
  const all = set(mod("a", ["b", "c"]), mod("b", ["c"]), mod("c"));
  assert.deepEqual(resolveOrder(all, ["a"]), ["c", "b", "a"]);
  assert.deepEqual(resolveOrder(all, ["a", "b"]), ["c", "b", "a"]);
});

test("detecta ciclos", () => {
  const all = set(mod("a", ["b"]), mod("b", ["a"]));
  assert.throws(
    () => resolveOrder(all, ["a"]),
    (e: Error) => e instanceof DependencyError && /ciclo/.test(e.message),
  );
});

test("detecta dependencias desconocidas", () => {
  assert.throws(() => resolveOrder(set(mod("a", ["x"])), ["a"]), /desconocido: x/);
});

test("los módulos reales del repo cargan y no tienen ciclos", async () => {
  const all = await loadModules(repoRoot());
  assert.ok(all.size >= 13);
  assert.doesNotThrow(() => resolveOrder(all, [...all.keys()]));
  for (const m of all.values())
    for (const d of m.depends) assert.ok(all.has(d), `${m.name} depende de ${d}`);
});

test("módulos habilitados = host + extra − skip", () => {
  const host = {
    name: "h",
    status: "supported" as const,
    os: "darwin",
    arch: "arm64",
    modules: ["a", "b"],
  };
  assert.deepEqual(enabledModuleNames(host, { modules_extra: ["c"], modules_skip: ["a"] }).sort(), [
    "b",
    "c",
  ]);
});
