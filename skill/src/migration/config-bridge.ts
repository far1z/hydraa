/**
 * Adapt OpenClaw workspace config for container deployment.
 * Maps local paths to container paths and injects secrets as env vars.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ContainerConfig {
  /** Environment variables for the container */
  env: Record<string, string>;
  /** Volume mounts (host:container format) */
  volumes: string[];
  /** Container entrypoint command */
  command: string;
}

interface OpenClawConfig {
  name?: string;
  skills?: string[];
  model?: string;
  gateway?: { port?: number };
  [key: string]: unknown;
}

interface BridgeOpts {
  /** Path to the local OpenClaw workspace */
  workspacePath: string;
  /** Additional environment variables to inject (secrets, keys, etc.) */
  env: Record<string, string>;
}

/**
 * Bridge local OpenClaw config for container deployment.
 * Reads openclaw.json, maps file paths to container paths,
 * and injects environment variables for secrets.
 */
export function bridgeConfig(opts: BridgeOpts): ContainerConfig {
  const { workspacePath, env: extraEnv } = opts;

  // Read openclaw.json
  const configPath = join(workspacePath, 'openclaw.json');
  let config: OpenClawConfig = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw) as OpenClawConfig;
  }

  // Base environment
  const env: Record<string, string> = {
    NODE_ENV: 'production',
    OPENCLAW_WORKSPACE: '/app/workspace',
    OPENCLAW_CONFIG: '/app/workspace/openclaw.json',
    OPENCLAW_SOUL: '/app/workspace/SOUL.md',
    OPENCLAW_SKILLS_DIR: '/app/workspace/skills',
    OPENCLAW_DATA_DIR: '/data',
  };

  // Map model config
  if (config.model) {
    env['OPENCLAW_MODEL'] = config.model;
  }

  // Map gateway config
  if (config.gateway?.port) {
    env['OPENCLAW_GATEWAY_PORT'] = String(config.gateway.port);
  }

  // Inject secret environment variables
  // These keys are expected from the caller (Nostr keys, wallet, channel tokens)
  const secretKeys = [
    'NOSTR_PRIVATE_KEY',
    'NOSTR_PUBLIC_KEY',
    'AKT_WALLET_MNEMONIC',
    'MOR_WALLET_KEY',
    'OPENCLAW_CHANNEL_WHATSAPP_TOKEN',
    'OPENCLAW_CHANNEL_TELEGRAM_TOKEN',
    'OPENCLAW_CHANNEL_DISCORD_TOKEN',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
  ];

  for (const key of secretKeys) {
    if (extraEnv[key]) {
      env[key] = extraEnv[key];
    }
  }

  // Pass through any other env vars from the caller
  for (const [key, value] of Object.entries(extraEnv)) {
    if (!env[key]) {
      env[key] = value;
    }
  }

  // Volume mounts
  const volumes: string[] = [
    '/data:/data', // Persistent data directory for SQLite cache, logs
  ];

  // Entrypoint command
  const command = 'node /app/workspace/node_modules/.bin/openclaw gateway';

  return { env, volumes, command };
}
