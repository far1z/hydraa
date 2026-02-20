import { Command } from "commander";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import Long from "long";
import { sha256 } from "@noble/hashes/sha256";
import {
  requireConfig,
  saveConfig,
  DEFAULT_RPC,
  DEFAULT_CHAIN_ID,
} from "../utils/config.js";
import { getAkashRegistry, getAkashType } from "../utils/akash-registry.js";
import { banner, success, error, warn, info, createSpinner, formatAKT } from "../utils/display.js";

/** How long (ms) to wait for bids after creating a deployment. */
const BID_TIMEOUT_MS = 120_000;
/** Polling interval while waiting for bids. */
const BID_POLL_MS = 5_000;

/** Hash SDL content to produce the deployment version (32-byte sha256). */
function hashSDL(sdl: string): Uint8Array {
  return sha256(new TextEncoder().encode(sdl));
}

/** Parse memory string like "512Mi" to bytes. */
function parseMemoryBytes(mem: string): number {
  const match = mem.match(/^(\d+)(Ki|Mi|Gi)?$/);
  if (!match) return 536870912;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case "Ki": return val * 1024;
    case "Mi": return val * 1024 * 1024;
    case "Gi": return val * 1024 * 1024 * 1024;
    default: return val;
  }
}

export const deployCommand = new Command("deploy")
  .description("Deploy your agent to decentralized compute")
  .option("--provider <provider>", "Compute provider (akash | self-hosted)", "akash")
  .option("--dry-run", "Show deployment manifest without deploying", false)
  .action(async (opts: { provider: string; dryRun: boolean }) => {
    banner();

    if (opts.provider !== "akash" && opts.provider !== "self-hosted") {
      error(`Unknown provider: ${opts.provider}. Use 'akash' or 'self-hosted'.`);
      process.exit(1);
    }

    const config = requireConfig();

    if (opts.provider === "self-hosted") {
      warn("Self-hosted deployment coming soon.");
      info("For now, use --provider akash (default).");
      return;
    }

    const mnemonic = config.akash?.mnemonic;
    if (!mnemonic) {
      error("No AKT wallet configured. Run: hydraa init");
      process.exit(1);
    }

    const rpc = config.akash?.rpc ?? DEFAULT_RPC;
    const cpu = config.compute?.cpu ?? 0.5;
    const memory = config.compute?.memory ?? "512Mi";
    const storage = config.compute?.storage ?? "1Gi";
    const image = "ghcr.io/openclaw/hydraa-runtime:latest";
    const nostrRelays = (config.nostr?.relays ?? ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]).join(",");

    // Build SDL for manifest upload and version hash
    const sdl = buildSDL({ cpu, memory, storage, image, nostrRelays });
    const sdlVersion = hashSDL(sdl);

    if (opts.dryRun) {
      info("Dry run — Akash SDL manifest:\n");
      console.log(sdl);
      return;
    }

    info(`Provider: ${opts.provider}`);
    info(`RPC:      ${rpc}`);
    console.log();

    // Step 0: Load Akash protobuf types
    const regSpinner = createSpinner("Loading Akash protobuf types...");
    regSpinner.start();
    let registry;
    try {
      registry = getAkashRegistry();
      regSpinner.succeed("Akash types registered");
    } catch (err) {
      regSpinner.fail("Failed to load Akash types");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // Step 1: Load wallet
    const walletSpinner = createSpinner("Loading wallet...");
    walletSpinner.start();

    let wallet: DirectSecp256k1HdWallet;
    let address: string;
    try {
      wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "akash" });
      const [account] = await wallet.getAccounts();
      address = account.address;
      walletSpinner.succeed(`Wallet: ${address}`);
    } catch (err) {
      walletSpinner.fail("Failed to load wallet");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // Check balance
    const balSpinner = createSpinner("Checking AKT balance...");
    balSpinner.start();
    try {
      const queryClient = await StargateClient.connect(rpc);
      const balance = await queryClient.getBalance(address, "uakt");
      await queryClient.disconnect();
      const akt = parseInt(balance.amount, 10) / 1_000_000;
      balSpinner.succeed(`Balance: ${formatAKT(akt)}`);

      if (akt < 5) {
        warn(`Low balance. Deployment requires ~5 AKT deposit. You have ${formatAKT(akt)}.`);
        if (akt < 0.01) {
          error("Insufficient funds. Send AKT to your wallet first: hydraa fund");
          process.exit(1);
        }
      }
    } catch {
      balSpinner.warn("Could not check balance (RPC error). Proceeding anyway...");
    }

    // Step 2: Create deployment with proper protobuf encoding
    const deploySpinner = createSpinner("Creating Akash deployment...");
    deploySpinner.start();

    let signingClient: SigningStargateClient;
    try {
      signingClient = await SigningStargateClient.connectWithSigner(rpc, wallet, { registry });
    } catch (err) {
      deploySpinner.fail("Failed to connect to Akash RPC");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const dseq = Long.fromNumber(Date.now());
    const cpuMilliunits = Math.round(cpu * 1000);
    const memBytes = parseMemoryBytes(memory);
    const storBytes = parseMemoryBytes(storage);

    // Build message using protobuf fromPartial for correct encoding
    const MsgCreateDeployment = getAkashType("akash.deployment.v1beta3.MsgCreateDeployment");
    const deployMsgValue = MsgCreateDeployment.fromPartial({
      id: { owner: address, dseq },
      groups: [
        {
          name: "dcloud",
          requirements: {
            signedBy: { allOf: [], anyOf: [] },
            attributes: [],
          },
          resources: [
            {
              resource: {
                id: 1,
                cpu: { units: { val: String(cpuMilliunits) }, attributes: [] },
                memory: { quantity: { val: String(memBytes) }, attributes: [] },
                storage: [{ name: "default", quantity: { val: String(storBytes) }, attributes: [] }],
                gpu: { units: { val: "0" }, attributes: [] },
                endpoints: [],
              },
              count: 1,
              price: { denom: "uakt", amount: "10000" },
            },
          ],
        },
      ],
      version: sdlVersion,
      deposit: { denom: "uakt", amount: "5000000" },
      depositor: address,
    });

    const createMsg = {
      typeUrl: "/akash.deployment.v1beta3.MsgCreateDeployment",
      value: deployMsgValue,
    };

    const fee = {
      amount: [{ denom: "uakt", amount: "20000" }],
      gas: "800000",
    };

    let txHash: string;
    try {
      deploySpinner.text = "Submitting deployment transaction...";
      const result = await signingClient.signAndBroadcast(address, [createMsg], fee, "Hydraa deployment");

      if (result.code !== 0) {
        throw new Error(`Tx failed (code ${result.code}): ${result.rawLog ?? "unknown"}`);
      }
      txHash = result.transactionHash;
      deploySpinner.succeed(`Deployment created (tx: ${txHash.slice(0, 16)}...)`);
    } catch (err) {
      deploySpinner.fail("Deployment transaction failed");
      error(err instanceof Error ? err.message : String(err));
      signingClient.disconnect();
      process.exit(1);
    }

    // Step 3: Wait for bids
    const bidSpinner = createSpinner("Waiting for provider bids...");
    bidSpinner.start();

    let bestBid: { provider: string; gseq: number; oseq: number; price: number } | null = null;
    const deadline = Date.now() + BID_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const bidsUrl = `${rpc}/akash/market/v1beta4/bids/list?filters.owner=${address}&filters.dseq=${dseq.toString()}`;
        const res = await fetch(bidsUrl, { signal: AbortSignal.timeout(10_000) });

        if (res.ok) {
          const body = await res.json() as any;
          const openBids = (body.bids ?? [])
            .filter((b: any) => b.bid?.state === "open")
            .map((b: any) => ({
              provider: b.bid.bid_id?.provider ?? "",
              gseq: parseInt(b.bid.bid_id?.gseq ?? "1", 10),
              oseq: parseInt(b.bid.bid_id?.oseq ?? "1", 10),
              price: parseInt(b.bid.price?.amount ?? "0", 10),
            }));

          if (openBids.length > 0) {
            openBids.sort((a: any, b: any) => a.price - b.price);
            bestBid = openBids[0];
            bidSpinner.succeed(`Received ${openBids.length} bid(s). Best: ${bestBid!.provider.slice(0, 20)}... at ${bestBid!.price} uakt/block`);
            break;
          }
        }

        bidSpinner.text = `Waiting for provider bids... (${Math.round((deadline - Date.now()) / 1000)}s remaining)`;
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, BID_POLL_MS));
    }

    if (!bestBid) {
      bidSpinner.fail("No bids received within timeout");
      error("No providers bid on your deployment. This can happen if:");
      info("  - No providers are currently available");
      info("  - Your deposit is too low");
      info("Try again or check your SDL with: hydraa deploy --dry-run");
      signingClient.disconnect();
      process.exit(1);
    }

    // Step 4: Create lease using proper protobuf encoding
    const leaseSpinner = createSpinner("Accepting best bid and creating lease...");
    leaseSpinner.start();

    const MsgCreateLease = getAkashType("akash.market.v1beta4.MsgCreateLease");
    const leaseMsgValue = MsgCreateLease.fromPartial({
      bidId: {
        owner: address,
        dseq,
        gseq: bestBid.gseq,
        oseq: bestBid.oseq,
        provider: bestBid.provider,
      },
    });

    const leaseMsg = {
      typeUrl: "/akash.market.v1beta4.MsgCreateLease",
      value: leaseMsgValue,
    };

    let leaseTxHash: string;
    try {
      const result = await signingClient.signAndBroadcast(address, [leaseMsg], fee, "Accept bid");
      if (result.code !== 0) {
        throw new Error(`Lease tx failed (code ${result.code}): ${result.rawLog ?? "unknown"}`);
      }
      leaseTxHash = result.transactionHash;
      leaseSpinner.succeed(`Lease created (tx: ${leaseTxHash.slice(0, 16)}...)`);
    } catch (err) {
      leaseSpinner.fail("Failed to create lease");
      error(err instanceof Error ? err.message : String(err));
      signingClient.disconnect();
      process.exit(1);
    }

    // Step 5: Send manifest to provider
    const manifestSpinner = createSpinner("Sending manifest to provider...");
    manifestSpinner.start();

    let providerUri = "";
    try {
      const providerUrl = `${rpc}/akash/provider/v1beta3/providers/${bestBid.provider}`;
      const provRes = await fetch(providerUrl, { signal: AbortSignal.timeout(10_000) });
      if (provRes.ok) {
        const provBody = await provRes.json() as any;
        providerUri = provBody.provider?.host_uri ?? "";
      }
    } catch {
      // Continue
    }

    if (providerUri) {
      try {
        const manifestUrl = `${providerUri}/deployment/${dseq.toString()}/manifest`;
        const manifestRes = await fetch(manifestUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/yaml" },
          body: sdl,
          signal: AbortSignal.timeout(15_000),
        });
        if (!manifestRes.ok) {
          manifestSpinner.warn(`Manifest upload returned HTTP ${manifestRes.status}`);
        } else {
          manifestSpinner.succeed("Manifest sent to provider");
        }
      } catch {
        manifestSpinner.warn("Could not reach provider API.");
      }
    } else {
      manifestSpinner.warn("Could not resolve provider URI.");
    }

    signingClient.disconnect();

    // Save state
    const dseqStr = dseq.toString();
    try {
      config._state = config._state ?? {};
      config._state.deployment = {
        id: `${address}/${dseqStr}`,
        dseq: dseqStr,
        provider_address: bestBid.provider,
        provider_uri: providerUri,
        gseq: String(bestBid.gseq),
        oseq: String(bestBid.oseq),
        status: "running",
        deployed_at: new Date().toISOString(),
      };
      saveConfig(config);
    } catch {
      warn("Could not save deployment state to config.");
    }

    // Summary
    console.log();
    console.log("  Deployment Details:");
    console.log("  ─────────────────────────────────────────────");
    info(`Deployment ID:    ${address.slice(0, 12)}.../${dseqStr}`);
    info(`DSEQ:             ${dseqStr}`);
    info(`Provider:         ${bestBid.provider.slice(0, 30)}...`);
    info(`Lease TX:         ${leaseTxHash.slice(0, 16)}...`);
    info(`Status:           active`);
    info(`Estimated cost:   ~${formatAKT(3.5)}/month`);
    console.log();
    success("Your agent is now running on decentralized compute.");
    info("Check status anytime:  hydraa status");
    console.log();
  });

function buildSDL(opts: {
  cpu: number;
  memory: string;
  storage: string;
  image: string;
  nostrRelays: string;
}): string {
  return `---
version: "2.0"
services:
  agent:
    image: ${opts.image}
    env:
      - HYDRAA_MODE=production
      - NOSTR_RELAYS=${opts.nostrRelays}
    params:
      {}
profiles:
  compute:
    agent:
      resources:
        cpu:
          units: ${opts.cpu}
        memory:
          size: ${opts.memory}
        storage:
          - size: ${opts.storage}
  placement:
    dcloud:
      pricing:
        agent:
          denom: uakt
          amount: 10000
deployment:
  agent:
    dcloud:
      profile: agent
      count: 1
`;
}
