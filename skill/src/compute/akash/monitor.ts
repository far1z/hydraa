/**
 * Akash deployment health monitoring.
 *
 * Queries the Akash provider REST API and on-chain lease state to determine
 * whether a deployment is healthy, degraded, or expired.
 */

import type { Deployment, HealthCheckResult } from '../interface.js';

/** Lease status as reported by the Akash chain. */
export type LeaseStatus = 'active' | 'closed' | 'insufficient_funds' | 'unknown';

export class AkashMonitor {
  private rpcEndpoint: string;

  constructor(rpcEndpoint: string) {
    this.rpcEndpoint = rpcEndpoint;
  }

  /**
   * Query the Akash provider API to determine container health.
   *
   * The provider exposes a REST endpoint at
   * `https://<provider>/lease/<dseq>/<gseq>/<oseq>/status` that reports the
   * running state of the workload.  We use that to determine healthiness and
   * measure round-trip latency.
   */
  async checkHealth(deployment: Deployment): Promise<HealthCheckResult> {
    const providerUri = deployment.metadata['providerUri'];
    const dseq = deployment.metadata['dseq'];
    const gseq = deployment.metadata['gseq'] ?? '1';
    const oseq = deployment.metadata['oseq'] ?? '1';

    if (!providerUri || !dseq) {
      return {
        healthy: false,
        message: 'Missing provider URI or deployment sequence in metadata',
        checkedAt: new Date(),
      };
    }

    const url = `${providerUri}/lease/${dseq}/${gseq}/${oseq}/status`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      const latency = Date.now() - start;

      if (!res.ok) {
        return {
          healthy: false,
          latency,
          message: `Provider returned HTTP ${res.status}`,
          checkedAt: new Date(),
        };
      }

      const body = (await res.json()) as Record<string, unknown>;
      const services = body['services'] as
        | Record<string, { available: number; total: number }>
        | undefined;

      // Consider healthy when at least one replica is available.
      const healthy =
        services != null &&
        Object.values(services).some((s) => s.available > 0);

      return {
        healthy,
        latency,
        message: healthy ? 'Container running' : 'No available replicas',
        checkedAt: new Date(),
      };
    } catch (err) {
      return {
        healthy: false,
        latency: Date.now() - start,
        message: `Health check failed: ${(err as Error).message}`,
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Query the Akash RPC for the on-chain lease status.
   *
   * Uses the REST LCD endpoint (`/akash/market/v1beta4/leases/...`).
   */
  async getLeaseStatus(deploymentId: string): Promise<LeaseStatus> {
    const [owner, dseq] = deploymentId.split('/');
    if (!owner || !dseq) return 'unknown';

    const url =
      `${this.rpcEndpoint}/akash/market/v1beta4/leases/list?filters.owner=${owner}&filters.dseq=${dseq}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return 'unknown';

      const body = (await res.json()) as {
        leases?: { lease?: { state?: string } }[];
      };

      const state = body.leases?.[0]?.lease?.state;

      switch (state) {
        case 'active':
          return 'active';
        case 'closed':
          return 'closed';
        case 'insufficient_funds':
          return 'insufficient_funds';
        default:
          return 'unknown';
      }
    } catch {
      return 'unknown';
    }
  }

  /**
   * Heuristic check for whether a lease is close to expiring.
   *
   * Akash leases auto-close when the escrow runs out. This method checks the
   * deployment creation time against a configurable threshold in hours to give
   * the operator time to top up funds.
   */
  isLeaseExpiring(deployment: Deployment, thresholdHours: number): boolean {
    const createdAt = deployment.createdAt.getTime();
    const elapsed = Date.now() - createdAt;
    const elapsedHours = elapsed / (1000 * 60 * 60);

    // If we don't have better on-chain data we fall back to a simple
    // time-based heuristic.  A future refinement would query the escrow
    // account balance and compute remaining blocks.
    return elapsedHours >= thresholdHours;
  }
}
