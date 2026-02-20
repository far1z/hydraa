/**
 * Container health monitor — Triggers self-heal after consecutive failures.
 */

export interface HealthMonitorDeps {
  providerManager: any;
  selfHealer: { heal: () => Promise<void> };
  maxFailures: number;
}

/**
 * Create a container health monitor compatible with the HeartbeatScheduler.
 *
 * Probes the active deployment's health endpoint. After `maxFailures`
 * consecutive failures, triggers the self-healer to redeploy.
 */
export function createHealthMonitor(deps: HealthMonitorDeps): () => Promise<void> {
  const { providerManager, selfHealer, maxFailures = 3 } = deps;
  let consecutiveFailures = 0;

  return async () => {
    const provider = await providerManager.getPrimaryProvider();
    const deployment = await providerManager.getActiveDeployment();

    if (!provider || !deployment) return;

    const result = await provider.healthCheck(deployment);

    if (result.healthy) {
      consecutiveFailures = 0;
      return;
    }

    consecutiveFailures++;
    console.warn(
      `[heartbeat] Health check failed (${consecutiveFailures}/${maxFailures}): ${result.message ?? 'unhealthy'}`,
    );

    if (consecutiveFailures >= maxFailures) {
      console.error('[heartbeat] Max failures reached — triggering self-heal.');
      consecutiveFailures = 0;
      await selfHealer.heal();
    }
  };
}
