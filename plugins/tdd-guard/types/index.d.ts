export type TddMode = "on" | "off";
export type TddRun = "red" | "green";

declare module "claude-code" {
  interface PluginState {
    "tdd-guard": { mode: TddMode | null; tests: string[]; last: TddRun | null; cwd: string };
  }
}
