/**
 * Multi-relay Nostr client with connection management, auto-reconnect,
 * deduplication, and pub/sub capabilities.
 */

import { SimplePool, type SubCloser } from 'nostr-tools/pool';
import type { Event, Filter } from 'nostr-tools';
import WebSocket from 'ws';
import { useWebSocketImplementation } from 'nostr-tools/pool';

// Register Node.js WebSocket implementation for nostr-tools
useWebSocketImplementation(WebSocket);

/** Connection status for a single relay. */
export interface RelayStatus {
  url: string;
  connected: boolean;
}

/** Options for the NostrClient. */
export interface NostrClientOptions {
  /** Maximum reconnect delay in ms. Default: 60000. */
  maxReconnectDelay?: number;
  /** Whether to enable auto-reconnect. Default: true. */
  enableReconnect?: boolean;
}

/**
 * Multi-relay Nostr client built on top of nostr-tools SimplePool.
 * Handles connection management, publishing, and subscribing across multiple relays.
 */
export class NostrClient {
  private pool: SimplePool;
  private relayUrls: string[];
  private connected: boolean = false;
  private seenEvents: Set<string> = new Set();
  private activeSubscriptions: SubCloser[] = [];

  /**
   * @param relayUrls - Array of relay WebSocket URLs (e.g. ["wss://relay.damus.io"]).
   * @param options - Optional client configuration.
   */
  constructor(relayUrls: string[], options: NostrClientOptions = {}) {
    this.relayUrls = relayUrls;
    this.pool = new SimplePool({
      enableReconnect: options.enableReconnect ?? true,
    });
  }

  /**
   * Connect to all configured relays.
   * Attempts connection to each relay independently; failures are logged but don't block others.
   */
  async connect(): Promise<void> {
    const results = await Promise.allSettled(
      this.relayUrls.map((url) => this.pool.ensureRelay(url)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        console.warn(
          `[NostrClient] Failed to connect to ${this.relayUrls[i]}: ${result.reason}`,
        );
      }
    }

    this.connected = true;
  }

  /**
   * Disconnect from all relays and clean up resources.
   */
  disconnect(): void {
    for (const sub of this.activeSubscriptions) {
      sub.close();
    }
    this.activeSubscriptions = [];
    this.pool.close(this.relayUrls);
    this.connected = false;
    this.seenEvents.clear();
  }

  /**
   * Publish a signed event to all connected relays.
   * @param event - A finalized (signed) Nostr event.
   * @returns Array of relay URLs that accepted the event.
   */
  async publish(event: Event): Promise<string[]> {
    const promises = this.pool.publish(this.relayUrls, event);
    const results = await Promise.allSettled(promises);

    const accepted: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        accepted.push(result.value);
      } else {
        console.warn(
          `[NostrClient] Publish rejected by relay: ${result.reason}`,
        );
      }
    }
    return accepted;
  }

  /**
   * Subscribe to events matching the given filters across all relays.
   * Automatically deduplicates events seen from multiple relays.
   * @param filters - Nostr filter object (kinds, authors, tags, etc.).
   * @param onEvent - Callback invoked for each unique event received.
   * @returns A SubCloser that can be used to close the subscription.
   */
  subscribe(
    filters: Filter,
    onEvent: (event: Event) => void,
  ): SubCloser {
    const sub = this.pool.subscribeMany(this.relayUrls, filters, {
      onevent: (event: Event) => {
        if (this.seenEvents.has(event.id)) return;
        this.seenEvents.add(event.id);
        onEvent(event);
      },
    });

    this.activeSubscriptions.push(sub);
    return sub;
  }

  /**
   * Query events matching filters, waiting for EOSE from all relays.
   * Returns deduplicated results.
   * @param filters - Nostr filter object.
   * @returns Array of matching events.
   */
  async querySync(filters: Filter): Promise<Event[]> {
    return this.pool.querySync(this.relayUrls, filters);
  }

  /**
   * Fetch a single event matching the filter.
   * @param filters - Nostr filter object.
   * @returns The matching event, or null.
   */
  async get(filters: Filter): Promise<Event | null> {
    return this.pool.get(this.relayUrls, filters);
  }

  /**
   * Get the list of connected relay URLs and their statuses.
   * @returns Array of RelayStatus objects.
   */
  getConnectedRelays(): RelayStatus[] {
    const statusMap = this.pool.listConnectionStatus();
    return this.relayUrls.map((url) => ({
      url,
      connected: statusMap.get(url) ?? false,
    }));
  }

  /** Whether the client has been connected (connect() was called). */
  get isConnected(): boolean {
    return this.connected;
  }

  /** The configured relay URLs. */
  get relays(): string[] {
    return [...this.relayUrls];
  }

  /** The underlying SimplePool instance, for advanced usage. */
  get rawPool(): SimplePool {
    return this.pool;
  }
}
