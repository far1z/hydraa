/**
 * Funding monitor — Alerts when the AKT balance drops below a threshold.
 */

export interface FundingMonitorDeps {
  providerManager: any;
  notifier: { notify: (message: string, priority: 'low' | 'normal' | 'high') => Promise<void> };
  threshold: number;
}

/**
 * Create a funding monitor function compatible with the HeartbeatScheduler.
 *
 * Checks the AKT balance on the primary provider and notifies the owner
 * when the balance falls below the configured threshold.
 */
export function createFundingMonitor(deps: FundingMonitorDeps): () => Promise<void> {
  const { providerManager, notifier, threshold } = deps;

  return async () => {
    const provider = await providerManager.getPrimaryProvider();
    if (!provider) return;

    const balance = await provider.getBalance();

    if (balance.amount < threshold) {
      await notifier.notify(
        `Low AKT balance: ${balance.amount} ${balance.denom} (threshold: ${threshold}). ` +
          'Top up soon to avoid compute interruption.',
        'high',
      );
    }
  };
}
