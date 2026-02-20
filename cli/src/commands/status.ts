import { Command } from "commander";
import chalk from "chalk";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import WebSocket from "ws";
import { getPublicKey, nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import {
  requireConfig,
  DEFAULT_RPC,
  MONTHLY_COST_ESTIMATE,
} from "../utils/config.js";
import { banner, table, formatAKT, formatUptime, info, warn, error, createSpinner } from "../utils/display.js";

function statusColor(status: string): string {
  switch (status) {
    case "active":
    case "connected":
    case "ok":
    case "healthy":
    case "running":
      return chalk.green(status);
    case "warning":
    case "degraded":
      return chalk.yellow(status);
    case "error":
    case "disconnected":
    case "down":
    case "failed":
      return chalk.red(status);
    default:
      return chalk.dim(status);
  }
}

/** Ping a single Nostr relay and return latency in ms, or null if unreachable. */
async function pingRelay(url: string, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve(null);
    }, timeoutMs);

    ws.on("open", () => {
      clearTimeout(timer);
      const latency = Date.now() - start;
      ws.close();
      resolve(latency);
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

export const statusCommand = new Command("status")
  .description("Show infrastructure status")
  .action(async () => {
    banner();

    const config = requireConfig();
    const rpc = config.akash?.rpc ?? DEFAULT_RPC;

    const spinner = createSpinner("Querying infrastructure...");
    spinner.start();

    // ── Compute status ────────────────────────────────────────
    const deployment = config._state?.deployment;
    let computeRows: string[][];

    if (deployment?.dseq) {
      // Query on-chain deployment status
      let leaseStatus = deployment.status ?? "unknown";
      try {
        const url = `${rpc}/akash/market/v1beta4/leases/list?filters.owner=${deployment.id?.split("/")[0]}&filters.dseq=${deployment.dseq}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const body = await res.json() as any;
          const leases = body.leases ?? [];
          if (leases.length > 0) {
            leaseStatus = leases[0].lease?.state ?? leaseStatus;
          }
        }
      } catch {
        // Keep existing status from config
      }

      const deployedAt = deployment.deployed_at ? new Date(deployment.deployed_at) : null;
      const uptimeSeconds = deployedAt ? Math.floor((Date.now() - deployedAt.getTime()) / 1000) : 0;

      computeRows = [
        ["Provider", "Akash Network"],
        ["Status", statusColor(leaseStatus)],
        ["DSEQ", deployment.dseq],
        ["Provider Address", (deployment.provider_address ?? "unknown").slice(0, 30) + "..."],
        ["Uptime", uptimeSeconds > 0 ? formatUptime(uptimeSeconds) : "—"],
        ["CPU", `${config.compute?.cpu ?? 0.5} vCPU`],
        ["Memory", config.compute?.memory ?? "512Mi"],
        ["Storage", config.compute?.storage ?? "1Gi"],
      ];
    } else {
      computeRows = [
        ["Provider", "—"],
        ["Status", statusColor("down")],
        ["Info", "No deployment found. Run: hydraa deploy"],
      ];
    }

    // ── Nostr status ──────────────────────────────────────────
    const relays = config.nostr?.relays ?? [];
    const relayResults: [string, string, string][] = [];

    for (const relay of relays) {
      const latency = await pingRelay(relay);
      if (latency !== null) {
        relayResults.push([relay, statusColor("connected"), `${latency}ms`]);
      } else {
        relayResults.push([relay, statusColor("disconnected"), "—"]);
      }
    }

    let npubDisplay = "—";
    if (config.nostr?.secret_key) {
      try {
        const sk = hexToBytes(config.nostr.secret_key);
        const pk = getPublicKey(sk);
        npubDisplay = nip19.npubEncode(pk);
      } catch {
        npubDisplay = "invalid key";
      }
    }

    // ── Funding status ────────────────────────────────────────
    let aktBalance = -1;
    let walletAddress = config.akash?.address ?? "—";

    if (config.akash?.mnemonic) {
      try {
        if (walletAddress === "—") {
          const wallet = await DirectSecp256k1HdWallet.fromMnemonic(config.akash.mnemonic, {
            prefix: "akash",
          });
          const [account] = await wallet.getAccounts();
          walletAddress = account.address;
        }

        const queryClient = await StargateClient.connect(rpc);
        const balance = await queryClient.getBalance(walletAddress, "uakt");
        await queryClient.disconnect();
        aktBalance = parseInt(balance.amount, 10) / 1_000_000;
      } catch {
        // Balance query failed — show what we have
      }
    }

    spinner.succeed("Infrastructure status retrieved\n");

    // ── Display ───────────────────────────────────────────────
    console.log(chalk.bold.underline("  Compute"));
    table(["Property", "Value"], computeRows);
    console.log();

    console.log(chalk.bold.underline("  Nostr"));
    if (relayResults.length > 0) {
      table(["Relay", "Status", "Latency"], relayResults);
    } else {
      info("No relays configured.");
    }
    console.log();
    info(`Identity: ${npubDisplay}`);
    console.log();

    console.log(chalk.bold.underline("  Funding"));
    if (aktBalance >= 0) {
      const runway = aktBalance > 0 ? aktBalance / MONTHLY_COST_ESTIMATE : 0;
      const runwayColor = runway > 3 ? chalk.green : runway > 1 ? chalk.yellow : chalk.red;

      table(
        ["Property", "Value"],
        [
          ["Wallet", walletAddress],
          ["AKT Balance", formatAKT(aktBalance)],
          ["Monthly Cost", `~${formatAKT(MONTHLY_COST_ESTIMATE)}`],
          ["Runway", runwayColor(runway > 0 ? `~${runway.toFixed(1)} months` : "empty")],
        ],
      );

      if (runway <= 1 && runway > 0) {
        error("Low funds! Run 'hydraa fund' to top up.");
      } else if (runway === 0) {
        error("Wallet is empty! Run 'hydraa fund' for deposit address.");
      } else if (runway <= 3) {
        warn("Consider topping up. Run 'hydraa fund' for details.");
      }
    } else {
      table(
        ["Property", "Value"],
        [
          ["Wallet", walletAddress],
          ["AKT Balance", "Could not query (RPC error)"],
        ],
      );
      warn("Run 'hydraa fund' to check balance manually.");
    }

    console.log();

    // Memory status — placeholder until deployment is live and relay sync is running
    console.log(chalk.bold.underline("  Memory"));
    if (deployment?.dseq) {
      const connectedRelays = relayResults.filter(r => r[1].includes("connected")).length;
      table(
        ["Property", "Value"],
        [
          ["Relay copies", `${connectedRelays}/${relays.length} relays reachable`],
          ["Local cache", statusColor(deployment.status === "running" ? "ok" : "down")],
        ],
      );
    } else {
      info("No deployment active. Memory sync starts after deploy.");
    }

    console.log();
  });
