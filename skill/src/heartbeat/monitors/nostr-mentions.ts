/**
 * Nostr mentions monitor — Subscribes to events that tag the agent's pubkey.
 */

export interface NostrMentionsMonitorDeps {
  nostrClient: any;
  nostrIdentity: any;
  onMention: (event: any) => void;
}

/**
 * Create a Nostr mentions monitor compatible with the HeartbeatScheduler.
 *
 * Subscribes to kind 1 events that contain a "p" tag matching the agent's
 * pubkey. Deduplicates already-seen events and forwards new ones to the
 * `onMention` callback.
 */
export function createNostrMentionsMonitor(deps: NostrMentionsMonitorDeps): () => Promise<void> {
  const { nostrClient, nostrIdentity, onMention } = deps;
  const seenIds = new Set<string>();

  return async () => {
    const pubkey = await nostrIdentity.getPublicKey();

    const events = await nostrClient.querySync({
      kinds: [1],
      '#p': [pubkey],
      limit: 50,
    });

    for (const event of events) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      onMention(event);
    }

    // Cap the seen-set to avoid unbounded growth
    if (seenIds.size > 10_000) {
      const entries = [...seenIds];
      const toRemove = entries.slice(0, entries.length - 5_000);
      for (const id of toRemove) {
        seenIds.delete(id);
      }
    }
  };
}
