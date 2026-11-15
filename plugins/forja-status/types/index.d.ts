export type ForjaSnapshot = {
  branch: string | null;
  port: number | null;
  drift: number | null;
  colima: "up" | "down" | null;
  awake: "on" | "orphan" | "off" | null;
  battery: number | null;
  onAc: boolean | null;
};
export type ForjaFinding = {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail?: string;
};

declare module "claude-code" {
  interface PluginState {
    "forja-status": {
      snapshot: Shaped<ForjaSnapshot>;
      findings: ForjaFinding[] | null;
      doctorRunning: boolean;
    };
  }
}
