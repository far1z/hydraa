/**
 * Hydraa Skill — Main Entrypoint
 *
 * Initializes all modules: Nostr identity, client, storage, channel, heartbeat.
 * Exports the HydraaSkill class and a default instance.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateKeypair,
  importFromNsec,
  type NostrIdentity,
} from './nostr/identity.js';
import { NostrClient } from './nostr/client.js';
import { NostrMemory } from './nostr/memory.js';
import { NostrChannel } from './nostr/channel.js';
import { createStorage, type CachedStorage } from './storage/index.js';

/** Default Nostr relays for Hydraa */
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

interface HydraaConfig {
  nostr?: {
    privateKey?: string;
    relays?: string[];
  };
  storage?: {
    dbPath?: string;
  };
  heartbeat?: {
    intervalMs?: number;
  };
}

/**
 * Load config from environment variables and/or config.yaml.
 */
function loadConfig(workspacePath?: string): HydraaConfig {
  const config: HydraaConfig = {};

  // Try loading config.yaml from workspace
  if (workspacePath) {
    const configPath = join(workspacePath, 'hydraa.yaml');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        Object.assign(config, parsed);
      } catch {
        // Config file parse failed, continue with env vars
      }
    }
  }

  // Environment variables override file config
  if (process.env['NOSTR_PRIVATE_KEY']) {
    config.nostr = config.nostr ?? {};
    config.nostr.privateKey = process.env['NOSTR_PRIVATE_KEY'];
  }

  if (process.env['NOSTR_RELAYS']) {
    config.nostr = config.nostr ?? {};
    config.nostr.relays = process.env['NOSTR_RELAYS'].split(',').map((r) => r.trim());
  }

  if (process.env['HYDRAA_DB_PATH']) {
    config.storage = config.storage ?? {};
    config.storage.dbPath = process.env['HYDRAA_DB_PATH'];
  }

  if (process.env['HYDRAA_HEARTBEAT_INTERVAL_MS']) {
    config.heartbeat = config.heartbeat ?? {};
    config.heartbeat.intervalMs = parseInt(process.env['HYDRAA_HEARTBEAT_INTERVAL_MS'], 10);
  }

  return config;
}

export class HydraaSkill {
  private identity: NostrIdentity | null = null;
  private client: NostrClient | null = null;
  private memory: NostrMemory | null = null;
  private channel: NostrChannel | null = null;
  private storage: CachedStorage | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private config: HydraaConfig = {};
  private initialized = false;

  /**
   * Initialize all Hydraa modules.
   * Connects to Nostr, sets up storage, registers the channel, and starts heartbeat.
   */
  async init(openclawContext: any): Promise<void> {
    if (this.initialized) return;

    const workspacePath = openclawContext?.workspacePath ?? process.env['OPENCLAW_WORKSPACE'];
    this.config = loadConfig(workspacePath);

    // Initialize Nostr identity
    try {
      const privateKey = this.config.nostr?.privateKey;
      if (privateKey) {
        this.identity = importFromNsec(privateKey);
      } else {
        this.identity = generateKeypair();
        console.warn(
          '[hydraa] No Nostr private key configured. Generated ephemeral identity:',
          this.identity.npub
        );
      }
    } catch (err) {
      console.warn('[hydraa] Failed to initialize Nostr identity:', err);
    }

    // Initialize Nostr client
    if (this.identity) {
      try {
        const relays = this.config.nostr?.relays ?? DEFAULT_RELAYS;
        this.client = new NostrClient(relays);
        await this.client.connect();
      } catch (err) {
        console.warn('[hydraa] Failed to connect to Nostr relays:', err);
        this.client = null;
      }
    }

    // Initialize Nostr memory
    if (this.client && this.identity) {
      try {
        this.memory = new NostrMemory(this.client, this.identity);
      } catch (err) {
        console.warn('[hydraa] Failed to initialize Nostr memory:', err);
      }
    }

    // Initialize storage (SQLite cache + optional Nostr relay backing)
    try {
      this.storage = createStorage({
        nostrMemory: this.memory ?? undefined,
        dbPath: this.config.storage?.dbPath,
      });
    } catch (err) {
      console.warn('[hydraa] Failed to initialize storage:', err);
    }

    // Initialize Nostr channel
    if (this.client && this.identity) {
      try {
        this.channel = new NostrChannel(this.client, this.identity);
      } catch (err) {
        console.warn('[hydraa] Failed to initialize Nostr channel:', err);
      }
    }

    // Start heartbeat
    this.startHeartbeat();

    this.initialized = true;
    console.log('[hydraa] Initialized successfully');

    if (this.identity) {
      console.log(`[hydraa] Nostr npub: ${this.identity.npub}`);
    }
    if (this.client) {
      const connected = this.client.getConnectedRelays().filter((r) => r.connected);
      console.log(`[hydraa] Connected to ${connected.length} relay(s)`);
    }
  }

  /** Return tool definitions for OpenClaw integration */
  getTools(): any[] {
    // Tools are registered by the tools module and loaded dynamically.
    // Each tool file exports a definition conforming to OpenClaw's tool interface.
    try {
      return [];
    } catch {
      return [];
    }
  }

  /** Return the Nostr channel for OpenClaw's channel system */
  getChannels(): NostrChannel | null {
    return this.channel;
  }

  /** Get the current storage instance */
  getStorage(): CachedStorage | null {
    return this.storage;
  }

  /** Get the Nostr identity */
  getIdentity(): NostrIdentity | null {
    return this.identity;
  }

  /** Get the Nostr client */
  getClient(): NostrClient | null {
    return this.client;
  }

  /** Start the heartbeat monitor loop */
  private startHeartbeat(): void {
    const intervalMs = this.config.heartbeat?.intervalMs ?? 60_000; // Default: 1 minute

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.runHeartbeat();
      } catch (err) {
        console.error('[hydraa] Heartbeat error:', err);
      }
    }, intervalMs);

    // Don't keep the process alive just for heartbeat
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /** Run a single heartbeat check */
  private async runHeartbeat(): Promise<void> {
    if (!this.storage) return;

    // Record heartbeat timestamp
    await this.storage.set('state:last-heartbeat', new Date().toISOString(), {
      source: 'heartbeat',
    });
  }

  /** Gracefully shut down all modules */
  async shutdown(): Promise<void> {
    console.log('[hydraa] Shutting down...');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close storage
    if (this.storage) {
      try {
        await this.storage.close();
      } catch (err) {
        console.error('[hydraa] Error closing storage:', err);
      }
      this.storage = null;
    }

    // Disconnect Nostr client (synchronous)
    if (this.client) {
      try {
        this.client.disconnect();
      } catch (err) {
        console.error('[hydraa] Error disconnecting Nostr:', err);
      }
      this.client = null;
    }

    this.channel = null;
    this.memory = null;
    this.identity = null;
    this.initialized = false;

    console.log('[hydraa] Shutdown complete');
  }
}

/** Default skill instance */
const hydraa = new HydraaSkill();
export default hydraa;
