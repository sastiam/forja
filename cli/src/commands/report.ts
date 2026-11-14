import { readFile, writeFile } from "node:fs/promises";
import { arch, release } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { load } from "../core/context.ts";
import { out } from "../core/log.ts";
import { repoRoot } from "../core/paths.ts";
import { computePlan } from "../core/plan.ts";
import { collectFindings, type Finding } from "./doctor.ts";

const ICON = { ok: "✅", warn: "⚠️", fail: "❌", skip: "➖" } as const;

export interface ReportInput {
  version: string;
  platform: string;
  arch: string;
  osRelease: string;
  date: string;
  modules: { name: string; status: string; pending: number }[];
  findings: Finding[];
}

/** Función pura: facilita probar el formato sin tocar la máquina. */
export function renderReport(r: ReportInput): string {
  const lines = [
    "# Estado de la máquina (forja)",
    "",
    `- Fecha: ${r.date}`,
    `- forja: ${r.version}`,
    `- Sistema: ${r.platform} ${r.osRelease} (${r.arch})`,
    "",
    "## Módulos",
    "",
    "| Módulo | Estado | Acciones pendientes |",
    "| --- | --- | --- |",
    ...r.modules.map((m) => `| ${m.name} | ${m.status} | ${m.pending} |`),
    "",
    "## Diagnóstico",
    "",
    ...r.findings.map((f) => `- ${ICON[f.status]} ${f.name}${f.detail ? ` — ${f.detail}` : ""}`),
    "",
  ];
  return lines.join("\n");
}

export async function reportCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: { output: { type: "string", short: "o" } },
  });
  const root = repoRoot();
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  const { ctx, all, order } = await load({ dryRun: true });
  const plans = await computePlan(ctx, all, order);
  const md = renderReport({
    version: pkg.version,
    platform: process.platform,
    arch: arch(),
    osRelease: release(),
    date: new Date().toISOString().slice(0, 10),
    modules: plans.map((p) => ({
      name: p.module,
      status: p.status,
      pending: p.actions.filter((a) => a.pending).length,
    })),
    findings: await collectFindings(),
  });
  if (values.output) await writeFile(values.output, md);
  else out(md);
  return 0;
}
