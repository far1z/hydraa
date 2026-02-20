/**
 * Multi-provider orchestration manager.
 *
 * Maintains a priority-ordered list of {@link ComputeProvider} instances and
 * handles deployment, status queries, and automatic failover.
 */

import { EventEmitter } from 'node:events';
import type {
  ComputeProvider,
  Deployment,
  DeploymentConfig,
  DeploymentStatus,
  HealthCheckResult,
  ProviderConfig,
} from './interface.js';

/** Events emitted by the ProviderManager. */
export interface ProviderManagerEvents {
  failover: [from: string, to: string];
}

export class ProviderManager extends EventEmitter {
  /** Providers sorted by priority (ascending — lower number = higher priority). */
  private providers: ComputeProvider[] = [];
  private configs: ProviderConfig[];

  /** Index into `providers` for the currently active provider. */
  private activeIndex = 0;

  /** The most recent deployment, if any. */
  private currentDeployment: Deployment | null = null;

  /**
   * @param configs  Provider configuration entries.  Will be sorted by
   *                 {@link ProviderConfig.priority} (ascending).
   * @param providers  Pre-instantiated provider instances, one per config
   *                   entry and in the same order as `configs`.
   */
  constructor(configs: ProviderConfig[], providers: ComputeProvider[]) {
    super();

    // Sort by priority ascending.
    const paired = configs.map((c, i) => ({ config: c, provider: providers[i] }));
    paired.sort((a, b) => a.config.priority - b.config.priority);

    this.configs = paired.map((p) => p.config);
    this.providers = paired.map((p) => p.provider);
  }

  /** Return the currently active provider. */
  getCurrentProvider(): ComputeProvider {
    return this.providers[this.activeIndex];
  }

  /** Return the current deployment, if any. */
  getDeployment(): Deployment | null {
    return this.currentDeployment;
  }

  /**
   * Deploy using the highest-priority available provider.
   *
   * If the first provider fails, each subsequent provider is tried in
   * priority order until one succeeds or all have been exhausted.
   */
  async deploy(config: DeploymentConfig): Promise<Deployment> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        const deployment = await provider.deploy(config);
        if (deployment.status === 'failed') {
          lastError = new Error(
            deployment.metadata['error'] ?? 'Deployment returned failed status',
          );
          continue;
        }
        this.activeIndex = i;
        this.currentDeployment = deployment;
        return deployment;
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw new Error(
      `All providers failed to deploy. Last error: ${lastError?.message ?? 'unknown'}`,
    );
  }

  /**
   * Return the deployment status from the current active provider.
   */
  async getStatus(): Promise<DeploymentStatus> {
    if (!this.currentDeployment) return 'unknown';
    return this.getCurrentProvider().status(this.currentDeployment);
  }

  /**
   * Run a health check against the current deployment.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.currentDeployment) {
      return {
        healthy: false,
        message: 'No active deployment',
        checkedAt: new Date(),
      };
    }
    return this.getCurrentProvider().healthCheck(this.currentDeployment);
  }

  /**
   * Failover from the current provider to the next available one.
   *
   * 1. Attempts to destroy the current deployment (best-effort).
   * 2. Tries each remaining provider in priority order.
   * 3. Emits a `failover` event on success.
   *
   * @throws If no remaining providers can deploy.
   */
  async failover(): Promise<Deployment> {
    const previousProvider = this.getCurrentProvider().name;
    const config = this.currentDeployment?.config;

    if (!config) {
      throw new Error('Cannot failover: no deployment config available');
    }

    // Best-effort teardown of the failing deployment.
    if (this.currentDeployment) {
      try {
        await this.getCurrentProvider().destroy(this.currentDeployment);
      } catch {
        // Ignore — the provider may already be unresponsive.
      }
    }

    // Try each provider after the current one (wrap around).
    let lastError: Error | null = null;

    for (let offset = 1; offset < this.providers.length; offset++) {
      const idx = (this.activeIndex + offset) % this.providers.length;
      const provider = this.providers[idx];

      try {
        const deployment = await provider.deploy(config);
        if (deployment.status === 'failed') {
          lastError = new Error(
            deployment.metadata['error'] ?? 'Deployment returned failed status',
          );
          continue;
        }

        this.activeIndex = idx;
        this.currentDeployment = deployment;
        this.emit('failover', previousProvider, provider.name);
        return deployment;
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw new Error(
      `Failover exhausted all providers. Last error: ${lastError?.message ?? 'unknown'}`,
    );
  }

  /**
   * Destroy the current deployment on its active provider.
   */
  async destroy(): Promise<void> {
    if (!this.currentDeployment) return;
    await this.getCurrentProvider().destroy(this.currentDeployment);
    this.currentDeployment = null;
  }
}
