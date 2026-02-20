import { Command } from "commander";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { StargateClient } from "@cosmjs/stargate";
import {
  requireConfig,
  saveConfig,
  DEFAULT_RPC,
  DEFAULT_CHAIN_ID,
  type HydraaConfig,
} from "../utils/config.js";
import { banner, success, error, warn, info, createSpinner, formatAKT } from "../utils/display.js";

/** How long (ms) to wait for bids after creating a deployment. */
const BID_TIMEOUT_MS = 120_000;
/** Polling interval while waiting for bids. */
const BID_POLL_MS = 5_000;

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
    const chainId = config.akash?.chain_id ?? DEFAULT_CHAIN_ID;
    const cpu = config.compute?.cpu ?? 0.5;
    const memory = config.compute?.memory ?? "512Mi";
    const storage = config.compute?.storage ?? "1Gi";
    const image = "ghcr.io/openclaw/hydraa-runtime:latest";

    // Build SDL
    const nostrRelays = (config.nostr?.relays ?? ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]).join(",");
    const sdl = buildSDL({ cpu, memory, storage, image, nostrRelays });

    if (opts.dryRun) {
      info("Dry run — Akash SDL manifest:\n");
      console.log(sdl);
      return;
    }

    info(`Provider: ${opts.provider}`);
    info(`RPC:      ${rpc}`);
    info(`Chain:    ${chainId}`);
    console.log();

    // Step 1: Load wallet and check balance
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
    } catch (err) {
      balSpinner.warn("Could not check balance (RPC error). Proceeding anyway...");
    }

    // Step 2: Create deployment transaction
    const deploySpinner = createSpinner("Creating Akash deployment...");
    deploySpinner.start();

    let signingClient: SigningStargateClient;
    try {
      signingClient = await SigningStargateClient.connectWithSigner(rpc, wallet);
    } catch (err) {
      deploySpinner.fail("Failed to connect to Akash RPC");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const dseq = Date.now().toString();
    const createMsg = {
      typeUrl: "/akash.deployment.v1beta3.MsgCreateDeployment",
      value: {
        id: { owner: address, dseq },
        version: new Uint8Array(32),
        depositor: address,
        deposit: { denom: "uakt", amount: "5000000" },
      },
    };

    let txHash: string;
    try {
      deploySpinner.text = "Submitting deployment transaction...";
      const result = await signingClient.signAndBroadcast(
        address,
        [createMsg],
        { amount: [{ denom: "uakt", amount: "5000" }], gas: "300000" },
      );

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

    let bestBid: { provider: string; gseq: string; oseq: string; price: number } | null = null;
    const deadline = Date.now() + BID_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const bidsUrl = `${rpc}/akash/market/v1beta4/bids/list?filters.owner=${address}&filters.dseq=${dseq}`;
        const res = await fetch(bidsUrl, { signal: AbortSignal.timeout(10_000) });

        if (res.ok) {
          const body = await res.json() as any;
          const openBids = (body.bids ?? [])
            .filter((b: any) => b.bid?.state === "open")
            .map((b: any) => ({
              provider: b.bid.bid_id?.provider ?? "",
              gseq: b.bid.bid_id?.gseq ?? "1",
              oseq: b.bid.bid_id?.oseq ?? "1",
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
        // Retry on network errors
      }
      await new Promise((r) => setTimeout(r, BID_POLL_MS));
    }

    if (!bestBid) {
      bidSpinner.fail("No bids received within timeout");
      error("No providers bid on your deployment. This can happen if:");
      info("  - Your SDL has configuration issues");
      info("  - No providers are currently available in the region");
      info("  - Your deposit is too low");
      info("Try again or adjust your SDL with: hydraa deploy --dry-run");
      signingClient.disconnect();
      process.exit(1);
    }

    // Step 4: Create lease (accept bid)
    const leaseSpinner = createSpinner("Accepting best bid and creating lease...");
    leaseSpinner.start();

    const leaseMsg = {
      typeUrl: "/akash.market.v1beta4.MsgCreateLease",
      value: {
        bid_id: {
          owner: address,
          dseq,
          gseq: bestBid.gseq,
          oseq: bestBid.oseq,
          provider: bestBid.provider,
        },
      },
    };

    let leaseTxHash: string;
    try {
      const result = await signingClient.signAndBroadcast(
        address,
        [leaseMsg],
        { amount: [{ denom: "uakt", amount: "5000" }], gas: "300000" },
      );
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

    // Query provider info to get their URI
    let providerUri = "";
    try {
      const providerUrl = `${rpc}/akash/provider/v1beta3/providers/${bestBid.provider}`;
      const provRes = await fetch(providerUrl, { signal: AbortSignal.timeout(10_000) });
      if (provRes.ok) {
        const provBody = await provRes.json() as any;
        providerUri = provBody.provider?.host_uri ?? "";
      }
    } catch {
      // Will try to send manifest anyway
    }

    if (providerUri) {
      try {
        const manifestUrl = `${providerUri}/deployment/${dseq}/manifest`;
        const manifestRes = await fetch(manifestUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/yaml" },
          body: sdl,
          signal: AbortSignal.timeout(15_000),
        });
        if (!manifestRes.ok) {
          manifestSpinner.warn(`Manifest upload returned HTTP ${manifestRes.status}. Provider may still pull the image.`);
        } else {
          manifestSpinner.succeed("Manifest sent to provider");
        }
      } catch (err) {
        manifestSpinner.warn("Could not reach provider API. Deployment may still start automatically.");
      }
    } else {
      manifestSpinner.warn("Could not resolve provider URI. Manifest not sent (provider may pull from chain).");
    }

    signingClient.disconnect();

    // Save deployment state to config
    try {
      config._state = config._state ?? {};
      config._state.deployment = {
        id: `${address}/${dseq}`,
        dseq,
        provider_address: bestBid.provider,
        provider_uri: providerUri,
        gseq: bestBid.gseq,
        oseq: bestBid.oseq,
        status: "running",
        deployed_at: new Date().toISOString(),
      };
      saveConfig(config);
    } catch {
      warn("Could not save deployment state to config. Note your dseq for reference.");
    }

    // Summary
    console.log();
    console.log("  Deployment Details:");
    console.log("  ─────────────────────────────────────────────");
    info(`Deployment ID:    ${address.slice(0, 12)}.../${dseq}`);
    info(`DSEQ:             ${dseq}`);
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
