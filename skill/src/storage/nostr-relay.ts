/**
 * Production storage backed by Nostr relays.
 * Uses NostrMemory for encrypted NIP-78 event storage.
 */

import type { Storage, StorageEntry } from './interface.js';
import type { NostrMemory } from '../nostr/memory.js';

/** Parse a storage key into type and subkey components */
function parseKey(key: string): { type: string; subkey: string } {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) {
    return { type: key, subkey: '' };
  }
  return {
    type: key.slice(0, colonIdx),
    subkey: key.slice(colonIdx + 1),
  };
}

/** Serialize value and metadata into a single JSON blob */
function packValue(value: string, metadata?: Record<string, string>): string {
  return JSON.stringify({ v: value, m: metadata ?? null });
}

/** Deserialize the packed value back into value + metadata */
function unpackValue(packed: string): { value: string; metadata?: Record<string, string> } {
  try {
    const obj = JSON.parse(packed) as { v: string; m: Record<string, string> | null };
    return {
      value: obj.v,
      metadata: obj.m ?? undefined,
    };
  } catch {
    // Legacy entries may be plain strings
    return { value: packed };
  }
}

export class NostrRelayStorage implements Storage {
  private memory: NostrMemory;

  constructor(memory: NostrMemory) {
    this.memory = memory;
  }

  async get(key: string): Promise<string | null> {
    const { type, subkey } = parseKey(key);
    const raw = await this.memory.get(type, subkey);
    if (raw === null || raw === undefined) {
      return null;
    }
    const { value } = unpackValue(raw);
    return value;
  }

  async set(key: string, value: string, metadata?: Record<string, string>): Promise<void> {
    const { type, subkey } = parseKey(key);
    const packed = packValue(value, metadata);
    await this.memory.set(type, subkey, packed);
  }

  async delete(key: string): Promise<void> {
    const { type, subkey } = parseKey(key);
    await this.memory.delete(type, subkey);
  }

  async list(prefix: string): Promise<StorageEntry[]> {
    const { type } = parseKey(prefix);
    const entries = await this.memory.list(type);
    return entries.map((entry: { key: string; value: string }) => {
      const { value, metadata } = unpackValue(entry.value);
      return {
        key: `${type}:${entry.key}`,
        value,
        metadata,
        updatedAt: new Date(),
      };
    });
  }

  async close(): Promise<void> {
    // NostrMemory lifecycle is managed by the client, nothing to close here
  }
}
