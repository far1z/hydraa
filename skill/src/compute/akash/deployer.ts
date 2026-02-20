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

import { createRequire } from 'node:module';
import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import Long from 'long';
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

/**
 * Load the Akash protobuf type registry so cosmjs can serialize Akash messages.
 * Side-effect imports of @akashnetwork/akash-api populate a global messageTypeRegistry.
 * We then register each type with a cosmjs Registry for proper encoding.
 */
function loadAkashRegistry(): { registry: Registry; types: Map<string, any> } {
  const require = createRequire(import.meta.url);
  require('@akashnetwork/akash-api/v1beta3');
  require('@akashnetwork/akash-api/v1beta4');
  const { messageTypeRegistry } = require('@akashnetwork/akash-api/typeRegistry');

  const registry = new Registry(defaultRegistryTypes);
  for (const [typeName, typeImpl] of messageTypeRegistry) {
    registry.register(`/${typeName}`, typeImpl as any);
  }
  return { registry, types: messageTypeRegistry };
}

/** Cached instances. */
let _loaded: { registry: Registry; types: Map<string, any> } | null = null;
function getLoaded() {
  if (!_loaded) _loaded = loadAkashRegistry();
  return _loaded;
}
function getRegistry(): Registry {
  return getLoaded().registry;
}
function getAkashType(name: string): any {
  const type = getLoaded().types.get(name);
  if (!type) throw new Error(`Unknown Akash type: ${name}`);
  return type;
}

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
    this.wallet = new AkashWallet(mnemonic, rpcEndpoint, getRegistry());
    this.monitor = new AkashMonitor(rpcEndpoint);
  }

  // -----------------------------------------------------------------------
  // ComputeProvider implementation
  // -----------------------------------------------------------------------

  async deploy(config: DeploymentConfig): Promise<Deployment> {
    const sdl = generateSDL(config);
    const address = await this.wallet.getAddress();

    // 1. Create deployment on-chain
    const dseq = Long.fromNumber(Date.now());
    const createMsg = buildCreateDeploymentMsg(address, dseq, sdl);

    const txHash = await this.wallet.signAndBroadcast(
      [createMsg],
      defaultFee(),
    );

    const dseqStr = dseq.toString();
    const deployment: Deployment = {
      id: `${address}/${dseqStr}`,
      provider: this.name,
      status: 'deploying',
      createdAt: new Date(),
      config,
      metadata: {
        dseq: dseqStr,
        txHash,
        sdl,
        owner: address,
      },
    };

    // 2. Wait for bids and pick the cheapest
    const bid = await this.waitForBids(address, dseqStr);
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
    deployment.metadata['gseq'] = String(bid.gseq);
    deployment.metadata['oseq'] = String(bid.oseq);

    // 4. Send the manifest to the provider
    await this.sendManifest(bid.providerUri ?? '', dseqStr, sdl);

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
    const dseqStr = deployment.metadata['dseq'];
    if (!dseqStr) throw new Error('Missing dseq in deployment metadata');
    const dseq = Long.fromString(dseqStr);

    // Close the lease first, then the deployment.
    const providerAddress = deployment.metadata['providerAddress'];
    const gseq = parseInt(deployment.metadata['gseq'] ?? '1', 10);
    const oseq = parseInt(deployment.metadata['oseq'] ?? '1', 10);

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
          gseq: parseInt(b.bid!.bid_id!.gseq ?? '1', 10),
          oseq: parseInt(b.bid!.bid_id!.oseq ?? '1', 10),
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
// Message builders — use fromPartial for proper protobuf encoding
// ---------------------------------------------------------------------------

interface Bid {
  provider: string;
  gseq: number;
  oseq: number;
  price: number;
  providerUri?: string;
}

function buildCreateDeploymentMsg(owner: string, dseq: Long, sdl: string) {
  const { sha256 } = require('@noble/hashes/sha256') as typeof import('@noble/hashes/sha256');
  const version = sha256(new TextEncoder().encode(sdl));
  const MsgCreateDeployment = getAkashType('akash.deployment.v1beta3.MsgCreateDeployment');
  return {
    typeUrl: '/akash.deployment.v1beta3.MsgCreateDeployment',
    value: MsgCreateDeployment.fromPartial({
      id: { owner, dseq },
      groups: [],
      version,
      depositor: owner,
      deposit: { denom: 'uakt', amount: '5000000' },
    }),
  };
}

function buildCreateLeaseMsg(
  owner: string,
  dseq: Long,
  provider: string,
  gseq: number,
  oseq: number,
) {
  const MsgCreateLease = getAkashType('akash.market.v1beta4.MsgCreateLease');
  return {
    typeUrl: '/akash.market.v1beta4.MsgCreateLease',
    value: MsgCreateLease.fromPartial({
      bidId: { owner, dseq, gseq, oseq, provider },
    }),
  };
}

function buildCloseLeaseMsg(
  owner: string,
  dseq: Long,
  provider: string,
  gseq: number,
  oseq: number,
) {
  const MsgCloseLease = getAkashType('akash.market.v1beta4.MsgCloseLease');
  return {
    typeUrl: '/akash.market.v1beta4.MsgCloseLease',
    value: MsgCloseLease.fromPartial({
      leaseId: { owner, dseq, gseq, oseq, provider },
    }),
  };
}

function buildCloseDeploymentMsg(owner: string, dseq: Long) {
  const MsgCloseDeployment = getAkashType('akash.deployment.v1beta3.MsgCloseDeployment');
  return {
    typeUrl: '/akash.deployment.v1beta3.MsgCloseDeployment',
    value: MsgCloseDeployment.fromPartial({
      id: { owner, dseq },
    }),
  };
}

function defaultFee() {
  return {
    amount: [{ denom: 'uakt', amount: '20000' }],
    gas: '800000',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
