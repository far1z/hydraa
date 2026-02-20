/**
 * Background Nostr DM listener.
 *
 * Connects to configured relays, subscribes to encrypted DMs addressed to the
 * agent's pubkey, decrypts them, and invokes a handler callback. This is the
 * bridge that lets users talk to their agent from any Nostr client.
 */

import { SimplePool } from "nostr-tools/pool";
import { getPublicKey } from "nostr-tools/pure";
import { nip04 } from "nostr-tools";
import type { Event, Filter } from "nostr-tools";
import type { SubCloser } from "nostr-tools/pool";
import WebSocket from "ws";
import { useWebSocketImplementation } from "nostr-tools/pool";

// Register Node.js WebSocket for nostr-tools (required in non-browser envs)
useWebSocketImplementation(WebSocket);

/** A decrypted incoming DM. */
export interface NostrDM {
  senderPubkey: string;
  content: string;
  timestamp: number;
  eventId: string;
  replyTo: (message: string) => Promise<void>;
}

/** Options for the listener. */
export interface ListenerOptions {
  /** Relay WebSocket URLs. */
  relays: string[];
  /** Agent's 32-byte secret key. */
  secretKey: Uint8Array;
  /** Called for each decrypted DM. Return a string to auto-reply. */
  onMessage: (dm: NostrDM) => void | Promise<void>;
  /** Called on errors (decryption failures, relay issues). */
  onError?: (err: Error) => void;
  /** Only process DMs received after this Unix timestamp. Default: now. */
  since?: number;
}

/**
 * Start listening for encrypted Nostr DMs addressed to the agent.
 *
 * Returns a cleanup function that disconnects from all relays and closes
 * subscriptions.
 *
 * @example
 * ```ts
 * const stop = await startNostrListener({
 *   relays: ["wss://relay.damus.io", "wss://nos.lol"],
 *   secretKey: agentSecretKey,
 *   onMessage: async (dm) => {
 *     console.log(`[${dm.senderPubkey}]: ${dm.content}`);
 *     await dm.replyTo("Got it!");
 *   },
 * });
 *
 * // Later:
 * stop();
 * ```
 */
export async function startNostrListener(
  opts: ListenerOptions,
): Promise<() => void> {
  const { relays, secretKey, onMessage, onError, since } = opts;
  const pubkey = getPublicKey(secretKey);
  const pool = new SimplePool();
  const seenIds = new Set<string>();

  // Ensure relays are connected
  await Promise.allSettled(relays.map((url) => pool.ensureRelay(url)));

  // Subscribe to NIP-04 encrypted DMs (kind 4) addressed to our pubkey
  const filter: Filter = {
    kinds: [4],
    "#p": [pubkey],
    since: since ?? Math.floor(Date.now() / 1000),
  };

  const sub: SubCloser = pool.subscribeMany(relays, filter, {
    onevent: async (event: Event) => {
      // Dedup events from multiple relays
      if (seenIds.has(event.id)) return;
      seenIds.add(event.id);

      try {
        // Decrypt NIP-04 content
        const decrypted = await nip04.decrypt(
          secretKey,
          event.pubkey,
          event.content,
        );

        const dm: NostrDM = {
          senderPubkey: event.pubkey,
          content: decrypted,
          timestamp: event.created_at,
          eventId: event.id,
          replyTo: async (message: string) => {
            await sendNip04DM(pool, relays, secretKey, pubkey, event.pubkey, message);
          },
        };

        await onMessage(dm);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (onError) {
          onError(error);
        } else {
          console.error(`[NostrListener] Failed to process DM ${event.id}:`, error.message);
        }
      }
    },
  });

  // Return cleanup function
  return () => {
    sub.close();
    pool.close(relays);
    seenIds.clear();
  };
}

/**
 * Send a NIP-04 encrypted DM.
 */
async function sendNip04DM(
  pool: SimplePool,
  relays: string[],
  senderSecretKey: Uint8Array,
  senderPubkey: string,
  recipientPubkey: string,
  content: string,
): Promise<void> {
  const { finalizeEvent } = await import("nostr-tools/pure");

  const encrypted = await nip04.encrypt(
    senderSecretKey,
    recipientPubkey,
    content,
  );

  const event = finalizeEvent(
    {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encrypted,
    },
    senderSecretKey,
  );

  await Promise.allSettled(pool.publish(relays, event));
}
