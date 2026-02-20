/**
 * Storage interface for Hydraa persistent state.
 * Implementations include Nostr relay-backed storage and local SQLite cache.
 */

export interface StorageEntry {
  key: string;
  value: string;
  metadata?: Record<string, string>;
  updatedAt: Date;
}

export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, metadata?: Record<string, string>): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StorageEntry[]>;
  close(): Promise<void>;
}
