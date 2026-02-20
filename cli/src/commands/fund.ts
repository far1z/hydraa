import { Command } from "commander";
import { banner, info, warn, success, formatAKT, table } from "../utils/display.js";

export const fundCommand = new Command("fund")
  .description("Check AKT wallet balance and funding info")
  .action(async () => {
    banner();

    info("Wallet Information\n");

    // Wallet details
    const walletAddress = "akash1abc...def";
    const balance = 12.5;
    const monthlyCost = 3.5;
    const runway = balance / monthlyCost;

    table(
      ["Property", "Value"],
      [
        ["Wallet Address", walletAddress],
        ["Current Balance", formatAKT(balance)],
        ["Monthly Cost", `~${formatAKT(monthlyCost)}`],
        ["Estimated Runway", `~${runway.toFixed(1)} months`],
      ],
    );

    console.log();

    // Deposit info
    info("To deposit AKT tokens, send to this address:");
    console.log();
    console.log(`    ${walletAddress}`);
    console.log();
    console.log("    [ QR code will render here in a future release ]");
    console.log();

    // Cost breakdown
    info("Cost Breakdown:");
    table(
      ["Resource", "Monthly Cost"],
      [
        ["Compute (0.5 CPU, 512Mi)", `~${formatAKT(2.8)}`],
        ["Storage (1Gi)", `~${formatAKT(0.5)}`],
        ["Network egress", `~${formatAKT(0.2)}`],
        ["Total", `~${formatAKT(3.5)}`],
      ],
    );

    console.log();

    if (runway > 3) {
      success("Funding looks good. No action needed.");
    } else if (runway > 1) {
      warn("Consider topping up within the next month.");
    } else {
      warn("Low balance! Your deployment may shut down soon.");
      info("Top up your wallet to keep your agent running.");
    }

    console.log();
    info("Get AKT tokens:");
    console.log("  - Osmosis DEX:     https://app.osmosis.zone");
    console.log("  - Centralized:     Available on major exchanges");
    console.log("  - Akash Console:   https://console.akash.network");
    console.log();
  });
