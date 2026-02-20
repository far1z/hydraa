/**
 * Akash Network compute provider.
 *
 * Implements the {@link ComputeProvider} interface for deploying containers
 * on the Akash decentralised cloud.  The lifecycle is:
 *
 *   1. Generate SDL from {@link DeploymentConfig}
 *   2. Broadcast a `MsgCreateDeployment` transaction
 *   3. Wait for provider bids, select the cheapest
 *   4. Create a lease with the winning bidder
 *   5. Monitor via the Akash provider REST API
 */

import type {
  ComputeProvider,
  Deployment,
  DeploymentConfig,
  DeploymentStatus,
  HealthCheckResult,
  FundingResult,
  Balance,
} from '../interface.js';
import { AkashWallet } from './wallet.js';
import { AkashMonitor } from './monitor.js';
import { generateSDL } from './sdl.js';

/** How long (ms) to wait for bids after creating a deployment. */
const BID_WAIT_MS = 30_000;
/** Polling interval while waiting for bids. */
const BID_POLL_MS = 5_000;

export class AkashProvider implements ComputeProvider {
  readonly name = 'akash';

  private wallet: AkashWallet;
  private monitor: AkashMonitor;
  private rpcEndpoint: string;
  private chainId: string;

  constructor(rpcEndpoint: string, mnemonic: string, chainId = 'akashnet-2') {
    this.rpcEndpoint = rpcEndpoint;
    this.chainId = chainId;
    this.wallet = new AkashWallet(mnemonic, rpcEndpoint);
    this.monitor = new AkashMonitor(rpcEndpoint);
  }

  // -----------------------------------------------------------------------
  // ComputeProvider implementation
  // -----------------------------------------------------------------------

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    const sdl = generateSDL(config);
    const address = await this.wallet.getAddress();

    // 1. Create deployment on-chain
    const dseq = Date.now().toString(); // Simple unique dseq
    const createMsg = buildCreateDeploymentMsg(address, dseq, sdl);

    const txHash = await this.wallet.signAndBroadcast(
      [createMsg],
      defaultFee(),
    );

    const deployment: Deployment = {
      id: `${address}/${dseq}`,
      provider: this.name,
      status: 'deploying',
      createdAt: new Date(),
      config,
      metadata: {
        dseq,
        txHash,
        sdl,
        owner: address,
      },
    };

    // 2. Wait for bids and pick the cheapest
    const bid = await this.waitForBids(address, dseq);
    if (!bid) {
      deployment.status = 'failed';
      deployment.metadata['error'] = 'No bids received within timeout';
      return deployment;
    }

    // 3. Create a lease with the winning bidder
    const leaseMsg = buildCreateLeaseMsg(
      address,
      dseq,
      bid.provider,
      bid.gseq,
      bid.oseq,
    );

    const leaseTxHash = await this.wallet.signAndBroadcast(
      [leaseMsg],
      defaultFee(),
    );

    deployment.metadata['leaseTxHash'] = leaseTxHash;
    deployment.metadata['providerAddress'] = bid.provider;
    deployment.metadata['providerUri'] = bid.providerUri ?? '';
    deployment.metadata['gseq'] = bid.gseq;
    deployment.metadata['oseq'] = bid.oseq;

    // 4. Send the manifest to the provider
    await this.sendManifest(bid.providerUri ?? '', dseq, sdl);

    deployment.status = 'running';
    return deployment;
  }

  async status(deployment: Deployment): Promise<DeploymentStatus> {
    const leaseStatus = await this.monitor.getLeaseStatus(deployment.id);
    switch (leaseStatus) {
      case 'active':
        return 'running';
      case 'closed':
        return 'stopped';
      case 'insufficient_funds':
        return 'failed';
      default:
        return 'unknown';
    }
  }

  async healthCheck(deployment: Deployment): Promise<HealthCheckResult> {
    return this.monitor.checkHealth(deployment);
  }

  async destroy(deployment: Deployment): Promise<void> {
    const address = await this.wallet.getAddress();
    const dseq = deployment.metadata['dseq'];
    if (!dseq) throw new Error('Missing dseq in deployment metadata');

    // Close the lease first, then the deployment.
    const providerAddress = deployment.metadata['providerAddress'];
    const gseq = deployment.metadata['gseq'] ?? '1';
    const oseq = deployment.metadata['oseq'] ?? '1';

    if (providerAddress) {
      const closeLeaseMsg = buildCloseLeaseMsg(
        address,
        dseq,
        providerAddress,
        gseq,
        oseq,
      );
      await this.wallet.signAndBroadcast([closeLeaseMsg], defaultFee());
    }

    const closeDeploymentMsg = buildCloseDeploymentMsg(address, dseq);
    await this.wallet.signAndBroadcast([closeDeploymentMsg], defaultFee());
  }

  async fund(_amount: number): Promise<FundingResult> {
    // Funding is handled externally — the user sends AKT to the deposit address.
    const depositAddr = await this.wallet.getDepositAddress();
    return {
      success: true,
      message: `Send AKT to ${depositAddr} to fund deployments.`,
    };
  }

  async getBalance(): Promise<Balance> {
    return this.wallet.getBalance();
  }

  async getLogs(deployment: Deployment, lines = 100): Promise<string[]> {
    const providerUri = deployment.metadata['providerUri'];
    const dseq = deployment.metadata['dseq'];
    const gseq = deployment.metadata['gseq'] ?? '1';
    const oseq = deployment.metadata['oseq'] ?? '1';

    if (!providerUri || !dseq) return ['Unable to fetch logs: missing metadata'];

    const url = `${providerUri}/lease/${dseq}/${gseq}/${oseq}/logs?follow=false&tail=${lines}&service=agent`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [`Provider returned HTTP ${res.status}`];
      const text = await res.text();
      return text.split('\n').filter(Boolean);
    } catch (err) {
      return [`Failed to fetch logs: ${(err as Error).message}`];
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Poll the Akash market module for bids on a deployment and return the
   * cheapest one.
   */
  private async waitForBids(
    owner: string,
    dseq: string,
  ): Promise<Bid | null> {
    const deadline = Date.now() + BID_WAIT_MS;

    while (Date.now() < deadline) {
      const bids = await this.fetchBids(owner, dseq);
      if (bids.length > 0) {
        // Sort by price ascending and return cheapest.
        bids.sort((a, b) => a.price - b.price);
        return bids[0];
      }
      await sleep(BID_POLL_MS);
    }

    return null;
  }

  /** Query the LCD for open bids on a given deployment. */
  private async fetchBids(owner: string, dseq: string): Promise<Bid[]> {
    const url =
      `${this.rpcEndpoint}/akash/market/v1beta4/bids/list?filters.owner=${owner}&filters.dseq=${dseq}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];

      const body = (await res.json()) as {
        bids?: {
          bid?: {
            bid_id?: { provider?: string; gseq?: string; oseq?: string };
            price?: { amount?: string };
            state?: string;
          };
        }[];
      };

      return (body.bids ?? [])
        .filter((b) => b.bid?.state === 'open')
        .map((b) => ({
          provider: b.bid!.bid_id!.provider ?? '',
          gseq: b.bid!.bid_id!.gseq ?? '1',
          oseq: b.bid!.bid_id!.oseq ?? '1',
          price: parseInt(b.bid!.price?.amount ?? '0', 10),
          providerUri: undefined as string | undefined,
        }));
    } catch {
      return [];
    }
  }

  /**
   * POST the deployment manifest (SDL) to the winning provider so it can
   * pull the container image and start the workload.
   */
  private async sendManifest(
    providerUri: string,
    dseq: string,
    sdl: string,
  ): Promise<void> {
    if (!providerUri) return;
    const url = `${providerUri}/deployment/${dseq}/manifest`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/yaml' },
      body: sdl,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Failed to send manifest: HTTP ${res.status}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------
// These produce Cosmos SDK `EncodeObject` values that cosmjs can sign.
// The actual protobuf types come from @akashnetwork/akashjs, but we build
// plain objects here so the module compiles even when the protobuf codegen
// isn't fully wired.

interface Bid {
  provider: string;
  gseq: string;
  oseq: string;
  price: number;
  providerUri?: string;
}

function buildCreateDeploymentMsg(owner: string, dseq: string, _sdl: string) {
  return {
    typeUrl: '/akash.deployment.v1beta3.MsgCreateDeployment',
    value: {
      id: { owner, dseq },
      version: new Uint8Array(32), // SDL hash placeholder
      depositor: owner,
      deposit: { denom: 'uakt', amount: '5000000' },
    },
  };
}

function buildCreateLeaseMsg(
  owner: string,
  dseq: string,
  provider: string,
  gseq: string,
  oseq: string,
) {
  return {
    typeUrl: '/akash.market.v1beta4.MsgCreateLease',
    value: {
      bid_id: { owner, dseq, gseq, oseq, provider },
    },
  };
}

function buildCloseLeaseMsg(
  owner: string,
  dseq: string,
  provider: string,
  gseq: string,
  oseq: string,
) {
  return {
    typeUrl: '/akash.market.v1beta4.MsgCloseLease',
    value: {
      lease_id: { owner, dseq, gseq, oseq, provider },
    },
  };
}

function buildCloseDeploymentMsg(owner: string, dseq: string) {
  return {
    typeUrl: '/akash.deployment.v1beta3.MsgCloseDeployment',
    value: {
      id: { owner, dseq },
    },
  };
}

function defaultFee() {
  return {
    amount: [{ denom: 'uakt', amount: '5000' }],
    gas: '300000',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
