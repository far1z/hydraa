/**
 * Storage factory — creates a CachedStorage that reads from SQLite first,
 * falls back to Nostr relays, and writes to both.
 */

export { type Storage, type StorageEntry } from './interface.js';
export { NostrRelayStorage } from './nostr-relay.js';
export { SqliteCacheStorage } from './sqlite-cache.js';

import type { Storage, StorageEntry } from './interface.js';
import { NostrRelayStorage } from './nostr-relay.js';
import { SqliteCacheStorage } from './sqlite-cache.js';
import type { NostrMemory } from '../nostr/memory.js';

export interface CreateStorageOpts {
  nostrMemory?: NostrMemory;
  dbPath?: string;
}

/**
 * Storage layer that reads from local SQLite cache first,
 * falls back to Nostr relay storage, and writes to both.
 */
export class CachedStorage implements Storage {
  private cache: SqliteCacheStorage;
  private relay: NostrRelayStorage | null;

  constructor(cache: SqliteCacheStorage, relay: NostrRelayStorage | null) {
    this.cache = cache;
    this.relay = relay;
  }

  async get(key: string): Promise<string | null> {
    // Try cache first
    const cached = await this.cache.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fall back to relay
    if (this.relay) {
      const relayValue = await this.relay.get(key);
      if (relayValue !== null) {
        // Backfill cache
        await this.cache.set(key, relayValue);
      }
      return relayValue;
    }

    return null;
  }

  async set(key: string, value: string, metadata?: Record<string, string>): Promise<void> {
    // Write to cache immediately
    await this.cache.set(key, value, metadata);

    // Write to relay in background
    if (this.relay) {
      this.relay.set(key, value, metadata).catch((err) => {
        console.error(`[hydraa] Failed to write to relay storage: ${key}`, err);
      });
    }
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
    if (this.relay) {
      this.relay.delete(key).catch((err) => {
        console.error(`[hydraa] Failed to delete from relay storage: ${key}`, err);
      });
    }
  }

  async list(prefix: string): Promise<StorageEntry[]> {
    // List from cache; relay list is expensive and used during sync
    return this.cache.list(prefix);
  }

  /** Pull all entries from relay storage into local cache */
  async sync(): Promise<void> {
    if (this.relay) {
      await this.cache.sync(this.relay);
    }
  }

  async close(): Promise<void> {
    await this.cache.close();
    if (this.relay) {
      await this.relay.close();
    }
  }
}

/** Create a CachedStorage with optional Nostr relay backing */
export function createStorage(opts: CreateStorageOpts): CachedStorage {
  const cache = new SqliteCacheStorage(opts.dbPath);
  const relay = opts.nostrMemory ? new NostrRelayStorage(opts.nostrMemory) : null;
  return new CachedStorage(cache, relay);
}
