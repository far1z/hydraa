/**
 * Relay connectivity monitor — Reconnects when connected relay count drops.
 */

export interface RelayMonitorDeps {
  nostrClient: any;
  minRelays: number;
}

/**
 * Create a Nostr relay connectivity monitor compatible with the HeartbeatScheduler.
 *
 * Checks how many relays are currently connected and attempts reconnection
 * when the count drops below `minRelays`.
 */
export function createRelayMonitor(deps: RelayMonitorDeps): () => Promise<void> {
  const { nostrClient, minRelays } = deps;
  let previousConnected = -1;

  return async () => {
    const status = await nostrClient.getRelayStatus();
    const connected: number = status.connected;
    const total: number = status.total;

    // Log changes
    if (connected !== previousConnected) {
      console.log(`[heartbeat] Relay status: ${connected}/${total} connected.`);
      previousConnected = connected;
    }

    if (connected < minRelays) {
      console.warn(
        `[heartbeat] Only ${connected} relays connected (min: ${minRelays}). Attempting reconnection...`,
      );
      try {
        await nostrClient.reconnect();
        const after = await nostrClient.getRelayStatus();
        console.log(`[heartbeat] After reconnect: ${after.connected}/${after.total} connected.`);
      } catch (err) {
        console.error('[heartbeat] Relay reconnection failed:', err);
      }
    }
  };
}
