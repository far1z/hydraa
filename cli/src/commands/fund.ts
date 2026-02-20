import { Command } from "commander";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import {
  requireConfig,
  DEFAULT_RPC,
  MONTHLY_COST_ESTIMATE,
} from "../utils/config.js";
import { banner, info, warn, success, error, formatAKT, table, createSpinner } from "../utils/display.js";

/** Derive wallet address from mnemonic */
async function getWalletAddress(mnemonic: string): Promise<string> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: "akash",
  });
  const [account] = await wallet.getAccounts();
  return account.address;
}

/** Query on-chain AKT balance */
async function queryBalance(
  rpcEndpoint: string,
  address: string,
): Promise<{ akt: number; uakt: string }> {
  const client = await StargateClient.connect(rpcEndpoint);
  const balance = await client.getBalance(address, "uakt");
  await client.disconnect();
  const akt = parseInt(balance.amount, 10) / 1_000_000;
  return { akt, uakt: balance.amount };
}

export const fundCommand = new Command("fund")
  .description("Check AKT wallet balance and funding info")
  .action(async () => {
    banner();

    const config = requireConfig();

    if (!config.akash?.mnemonic) {
      error("No AKT wallet found. Run 'hydraa init' first to generate one.");
      process.exit(1);
    }

    const mnemonic = config.akash.mnemonic;
    const rpc = config.akash.rpc ?? DEFAULT_RPC;

    // Derive address
    const addrSpinner = createSpinner("Deriving wallet address...");
    addrSpinner.start();
    const walletAddress = config.akash.address ?? (await getWalletAddress(mnemonic));
    addrSpinner.succeed(`Wallet: ${walletAddress}`);

    // Query balance
    const balSpinner = createSpinner("Querying on-chain balance...");
    balSpinner.start();

    let aktBalance: number;
    try {
      const result = await queryBalance(rpc, walletAddress);
      aktBalance = result.akt;
      balSpinner.succeed("Balance retrieved");
    } catch (err) {
      balSpinner.fail("Could not query balance");
      warn(`RPC error: ${err instanceof Error ? err.message : String(err)}`);
      warn(`Tried endpoint: ${rpc}`);
      info("Your wallet address is still valid. Check balance manually or try again later.");
      console.log();
      console.log(`  Wallet Address: ${walletAddress}`);
      console.log();
      return;
    }

    const runway = aktBalance > 0 ? aktBalance / MONTHLY_COST_ESTIMATE : 0;

    console.log();
    info("Wallet Information\n");

    table(
      ["Property", "Value"],
      [
        ["Wallet Address", walletAddress],
        ["Current Balance", formatAKT(aktBalance)],
        ["Monthly Cost", `~${formatAKT(MONTHLY_COST_ESTIMATE)}`],
        ["Estimated Runway", runway > 0 ? `~${runway.toFixed(1)} months` : "—"],
      ],
    );

    console.log();

    if (aktBalance === 0) {
      warn("Wallet is empty. Send AKT to get started.");
      console.log();
      info("Send AKT tokens to this address:");
      console.log();
      console.log(`    ${walletAddress}`);
      console.log();
      info("~$5 worth of AKT is enough for about 1 month of compute.");
    } else if (runway > 3) {
      success("Funding looks good. No action needed.");
    } else if (runway > 1) {
      warn("Consider topping up within the next month.");
      console.log();
      info("Deposit address:");
      console.log(`    ${walletAddress}`);
    } else {
      warn("Low balance! Your deployment may shut down soon.");
      console.log();
      info("Top up immediately:");
      console.log(`    ${walletAddress}`);
    }

    console.log();

    // Cost breakdown
    info("Cost Breakdown:");
    table(
      ["Resource", "Monthly Cost"],
      [
        ["Compute (0.5 CPU, 512Mi)", `~${formatAKT(2.8)}`],
        ["Storage (1Gi)", `~${formatAKT(0.5)}`],
        ["Network egress", `~${formatAKT(0.2)}`],
        ["Total", `~${formatAKT(MONTHLY_COST_ESTIMATE)}`],
      ],
    );

    console.log();
    info("Get AKT tokens:");
    console.log("  - Osmosis DEX:     https://app.osmosis.zone");
    console.log("  - Centralized:     Available on major exchanges");
    console.log("  - Akash Console:   https://console.akash.network");
    console.log();
  });
