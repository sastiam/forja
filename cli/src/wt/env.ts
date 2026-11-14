export interface WorktreeEnv {
  name: string;
  port: number;
  composeProject: string;
  floci: boolean;
}

export function renderEnv(e: WorktreeEnv): string {
  const lines = [
    `WT_NAME=${e.name}`,
    `WT_PORT=${e.port}`,
    `COMPOSE_PROJECT_NAME=${e.composeProject}`,
  ];
  if (e.floci) lines.push("AWS_PROFILE=floci");
  return `${lines.join("\n")}\n`;
}
