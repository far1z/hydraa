/**
 * Self-healer — Redeploys the agent container on failure, with provider failover.
 */

import type { Notifier } from './notify.js';

export interface SelfHealerDeps {
  providerManager: any;
  storage: any;
  notifier: Notifier;
  maxRetries: number;
}

export interface SelfHealer {
  heal: () => Promise<void>;
}

/**
 * Create a self-healer that attempts to redeploy the agent container.
 *
 * Strategy:
 * 1. Try redeploying on the same provider.
 * 2. If that fails, iterate through other configured providers (failover).
 * 3. After a successful redeploy, sync memory from Nostr relays.
 * 4. Notify the owner of the recovery.
 * 5. Give up after `maxRetries` total attempts.
 */
export function createSelfHealer(deps: SelfHealerDeps): SelfHealer {
  const { providerManager, storage, notifier, maxRetries } = deps;
  let retryCount = 0;

  return {
    async heal(): Promise<void> {
      if (retryCount >= maxRetries) {
        console.error('[self-heal] Max retries exhausted. Giving up.');
        await notifier.notify(
          `Self-heal failed after ${maxRetries} attempts. Manual intervention required.`,
          'high',
        );
        return;
      }

      retryCount++;
      console.log(`[self-heal] Attempt ${retryCount}/${maxRetries}...`);

      // Try current provider first
      try {
        const provider = await providerManager.getPrimaryProvider();
        if (provider) {
          const config = await providerManager.getLastDeploymentConfig();
          if (config) {
            const deployment = await provider.deploy(config);
            console.log(`[self-heal] Redeployed on ${provider.name}: ${deployment.id}`);
            await syncMemory(storage);
            retryCount = 0;
            await notifier.notify(
              `Self-healed: redeployed on ${provider.name} (${deployment.id}).`,
              'normal',
            );
            return;
          }
        }
      } catch (err) {
        console.warn('[self-heal] Primary provider redeploy failed:', err);
      }

      // Failover to other providers
      try {
        const providers = await providerManager.getAllProviders();
        for (const provider of providers) {
          try {
            const config = await providerManager.getLastDeploymentConfig();
            if (!config) continue;

            const deployment = await provider.deploy(config);
            console.log(`[self-heal] Failover to ${provider.name}: ${deployment.id}`);
            await syncMemory(storage);
            retryCount = 0;
            await notifier.notify(
              `Self-healed via failover to ${provider.name} (${deployment.id}).`,
              'normal',
            );
            return;
          } catch {
            continue;
          }
        }
      } catch (err) {
        console.error('[self-heal] Failover failed:', err);
      }

      await notifier.notify(
        `Self-heal attempt ${retryCount}/${maxRetries} failed on all providers.`,
        'high',
      );
    },
  };
}

/** Sync memory entries from Nostr relays back to local storage. */
async function syncMemory(storage: any): Promise<void> {
  try {
    await storage.syncFromRelays();
  } catch (err) {
    console.warn('[self-heal] Memory sync from relays failed:', err);
  }
}
