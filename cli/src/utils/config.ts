/**
 * Shared config loader for Hydraa CLI commands.
 * Reads config.yaml from the OpenClaw workspace.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface HydraaConfig {
  nostr?: {
    secret_key?: string;
    relays?: string[];
  };
  akash?: {
    mnemonic?: string;
    address?: string;
    rpc?: string;
    chain_id?: string;
  };
  compute?: {
    provider?: string;
    cpu?: number;
    memory?: string;
    storage?: string;
  };
  heartbeat?: {
    cheap_interval?: number;
    summary_hour?: number;
  };
  /** Runtime state persisted between commands (deployment info, etc.) */
  _state?: {
    deployment?: {
      id?: string;
      dseq?: string;
      provider_address?: string;
      provider_uri?: string;
      gseq?: string;
      oseq?: string;
      status?: string;
      deployed_at?: string;
    };
  };
}

const CONFIG_SEARCH_PATHS = [
  join(homedir(), ".openclaw", "skills", "hydraa", "config.yaml"),
  join(process.cwd(), ".openclaw", "skills", "hydraa", "config.yaml"),
];

/** Find the config file path, or null if not found. */
export function findConfigPath(): string | null {
  for (const p of CONFIG_SEARCH_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load and parse the Hydraa config.yaml. Returns null if not found. */
export function loadConfig(): HydraaConfig | null {
  const p = findConfigPath();
  if (!p) return null;
  const raw = readFileSync(p, "utf-8");
  return parseYaml(raw) as HydraaConfig;
}

/** Save config back to disk (merges _state into existing file). */
export function saveConfig(config: HydraaConfig): void {
  const p = findConfigPath();
  if (!p) throw new Error("No config file found. Run 'hydraa init' first.");
  writeFileSync(p, stringifyYaml(config), "utf-8");
}

/** Load config or exit with error if not found. */
export function requireConfig(): HydraaConfig {
  const config = loadConfig();
  if (!config) {
    console.error("  No Hydraa config found. Run 'hydraa init' first.");
    process.exit(1);
  }
  return config;
}

/** Default Akash RPC endpoint. */
export const DEFAULT_RPC = "https://rpc.akashnet.net:443";

/** Default Akash chain ID. */
export const DEFAULT_CHAIN_ID = "akashnet-2";

/** Estimated monthly cost in AKT. */
export const MONTHLY_COST_ESTIMATE = 3.5;
