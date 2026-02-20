/**
 * MOR stake status monitor — Checks MOR balance via Everclaw if available.
 */

export interface MorBalanceMonitorDeps {
  config: {
    morThreshold?: number;
    everclawEndpoint?: string;
    [key: string]: unknown;
  };
}

/**
 * Create a MOR balance monitor compatible with the HeartbeatScheduler.
 *
 * If Everclaw is configured, queries the MOR balance and alerts when it
 * drops below the configured threshold. Otherwise this monitor is a no-op.
 */
export function createMorBalanceMonitor(deps: MorBalanceMonitorDeps): () => Promise<void> {
  const { config } = deps;

  return async () => {
    const endpoint = config.everclawEndpoint;
    if (!endpoint) {
      // Everclaw not installed — skip silently
      return;
    }

    try {
      const res = await fetch(`${endpoint}/api/mor/balance`);
      if (!res.ok) {
        console.warn(`[heartbeat] MOR balance check returned status ${res.status}.`);
        return;
      }

      const data = (await res.json()) as { balance?: number };
      const balance = data.balance ?? 0;
      const threshold = config.morThreshold ?? 1;

      if (balance < threshold) {
        console.warn(
          `[heartbeat] MOR balance low: ${balance} (threshold: ${threshold}). Stake may be at risk.`,
        );
      }
    } catch (err) {
      console.warn('[heartbeat] Could not reach Everclaw for MOR balance:', err);
    }
  };
}
