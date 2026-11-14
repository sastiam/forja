import { styleText } from "node:util";

// Todo el log va a stderr; stdout queda libre para datos (--json, --print-path).
const color = (fmt: Parameters<typeof styleText>[0], s: string): string =>
  process.stderr.isTTY ? styleText(fmt, s) : s;

export const log = {
  info: (m: string): void => void process.stderr.write(`${m}\n`),
  step: (m: string): void => void process.stderr.write(`${color("cyan", "›")} ${m}\n`),
  ok: (m: string): void => void process.stderr.write(`${color("green", "✔")} ${m}\n`),
  warn: (m: string): void => void process.stderr.write(`${color("yellow", "!")} ${m}\n`),
  error: (m: string): void => void process.stderr.write(`${color("red", "✖")} ${m}\n`),
};

export function out(m: string): void {
  process.stdout.write(`${m}\n`);
}

export function outJson(v: unknown): void {
  out(JSON.stringify(v, null, 2));
}
