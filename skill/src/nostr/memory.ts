/**
 * Encrypted NIP-78 application-specific data storage on Nostr relays.
 * Stores key-value data as addressable (replaceable) events with kind 30078,
 * encrypted to the agent's own key using NIP-44.
 */

import { finalizeEvent } from 'nostr-tools/pure';
import type { Event, EventTemplate } from 'nostr-tools';
import type { NostrClient } from './client.js';
import type { NostrIdentity } from './identity.js';
import { encrypt, decrypt } from './encryption.js';

/** Namespace prefix for all Hydraa memory d-tags. */
const NAMESPACE_PREFIX = 'hydraa';

/** Kind 30078 — NIP-78 application-specific data. */
const KIND_APPLICATION_DATA = 30078;

/** Kind 5 — event deletion (NIP-09). */
const KIND_DELETION = 5;

/**
 * Build a d-tag value for the given type and key.
 * Pattern: hydraa:{type}:{key}
 */
function buildDTag(type: string, key: string): string {
  return `${NAMESPACE_PREFIX}:${type}:${key}`;
}

/**
 * Parse a d-tag value back into type and key components.
 * Returns null if the tag doesn't match the hydraa namespace.
 */
function parseDTag(dtag: string): { type: string; key: string } | null {
  const parts = dtag.split(':');
  if (parts.length < 3 || parts[0] !== NAMESPACE_PREFIX) return null;
  const type = parts[1];
  const key = parts.slice(2).join(':');
  return { type, key };
}

/**
 * Encrypted key-value memory storage backed by Nostr NIP-78 events.
 * All values are encrypted to the agent's own public key using NIP-44,
 * ensuring only the agent can read its own memory.
 */
export class NostrMemory {
  private client: NostrClient;
  private identity: NostrIdentity;

  /**
   * @param client - A connected NostrClient instance.
   * @param identity - The agent's NostrIdentity (used for signing and encryption).
   */
  constructor(client: NostrClient, identity: NostrIdentity) {
    this.client = client;
    this.identity = identity;
  }

  /**
   * Store a value in Nostr memory. The value is NIP-44 encrypted to the agent's
   * own key and published as an addressable kind 30078 event.
   * @param type - The data category (e.g. "config", "state").
   * @param key - The specific key within that category.
   * @param value - The plaintext value to store.
   */
  async set(type: string, key: string, value: string): Promise<void> {
    const encrypted = encrypt(
      value,
      this.identity.secretKey,
      this.identity.publicKey,
    );

    const template: EventTemplate = {
      kind: KIND_APPLICATION_DATA,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', buildDTag(type, key)]],
      content: encrypted,
    };

    const event = finalizeEvent(template, this.identity.secretKey);
    await this.client.publish(event);
  }

  /**
   * Retrieve a value from Nostr memory by type and key.
   * Fetches the latest kind 30078 event with the matching d-tag, then decrypts.
   * @param type - The data category.
   * @param key - The specific key.
   * @returns The decrypted plaintext value, or null if not found.
   */
  async get(type: string, key: string): Promise<string | null> {
    const event = await this.client.get({
      kinds: [KIND_APPLICATION_DATA],
      authors: [this.identity.publicKey],
      '#d': [buildDTag(type, key)],
    });

    if (!event) return null;

    return decrypt(
      event.content,
      this.identity.secretKey,
      this.identity.publicKey,
    );
  }

  /**
   * Delete a memory entry by publishing a kind 5 deletion event (NIP-09)
   * that references the addressable event coordinate.
   * @param type - The data category.
   * @param key - The specific key to delete.
   */
  async delete(type: string, key: string): Promise<void> {
    const dtag = buildDTag(type, key);
    const coordinate = `${KIND_APPLICATION_DATA}:${this.identity.publicKey}:${dtag}`;

    const template: EventTemplate = {
      kind: KIND_DELETION,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['a', coordinate]],
      content: '',
    };

    const event = finalizeEvent(template, this.identity.secretKey);
    await this.client.publish(event);
  }

  /**
   * List all memory entries of a given type.
   * Fetches all kind 30078 events whose d-tag starts with hydraa:{type}:
   * and decrypts each one.
   * @param type - The data category to list.
   * @returns Array of {key, value} pairs.
   */
  async list(type: string): Promise<Array<{ key: string; value: string }>> {
    const events = await this.client.querySync({
      kinds: [KIND_APPLICATION_DATA],
      authors: [this.identity.publicKey],
    });

    const prefix = `${NAMESPACE_PREFIX}:${type}:`;
    const results: Array<{ key: string; value: string }> = [];

    for (const event of events) {
      const dtag = event.tags.find((t) => t[0] === 'd')?.[1];
      if (!dtag || !dtag.startsWith(prefix)) continue;

      const parsed = parseDTag(dtag);
      if (!parsed) continue;

      try {
        const value = decrypt(
          event.content,
          this.identity.secretKey,
          this.identity.publicKey,
        );
        results.push({ key: parsed.key, value });
      } catch {
        console.warn(`[NostrMemory] Failed to decrypt event ${event.id}`);
      }
    }

    return results;
  }
}
