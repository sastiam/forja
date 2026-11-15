export type TokenSaverSaved = number | null;

declare module "claude-code" {
  interface PluginState {
    "token-saver": { saved: TokenSaverSaved; percent: number | null; refreshedAt: number };
  }
}
