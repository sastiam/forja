import { createInterface } from "node:readline/promises";

export const isInteractive = (): boolean => Boolean(process.stdin.isTTY && process.stderr.isTTY);

export async function ask(question: string, def = ""): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const a = (await rl.question(def ? `${question} [${def}]: ` : `${question}: `)).trim();
    return a || def;
  } finally {
    rl.close();
  }
}

export async function confirm(question: string): Promise<boolean> {
  return /^(s|si|sí|y|yes)$/i.test(await ask(`${question} (s/N)`));
}
