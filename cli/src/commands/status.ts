import { Command } from "commander";
import chalk from "chalk";
import { banner, table, formatAKT, formatUptime, info, warn, error } from "../utils/display.js";

function statusColor(status: string): string {
  switch (status) {
    case "active":
    case "connected":
    case "ok":
    case "healthy":
      return chalk.green(status);
    case "warning":
    case "degraded":
      return chalk.yellow(status);
    case "error":
    case "disconnected":
    case "down":
      return chalk.red(status);
    default:
      return chalk.dim(status);
  }
}

export const statusCommand = new Command("status")
  .description("Show infrastructure status")
  .action(async () => {
    banner();

    info("Querying infrastructure...\n");

    // Compute status
    console.log(chalk.bold.underline("  Compute"));
    table(
      ["Property", "Value"],
      [
        ["Provider", "Akash Network"],
        ["Status", statusColor("active")],
        ["Deployment", "dseq/1234567"],
        ["Uptime", formatUptime(86400 * 3 + 3600 * 7 + 60 * 23)],
        ["CPU", "0.5 vCPU"],
        ["Memory", "512Mi"],
        ["Storage", "1Gi"],
      ],
    );

    console.log();

    // Nostr status
    console.log(chalk.bold.underline("  Nostr"));
    table(
      ["Relay", "Status", "Latency"],
      [
        ["wss://relay.damus.io", statusColor("connected"), "45ms"],
        ["wss://nos.lol", statusColor("connected"), "62ms"],
        ["wss://relay.nostr.band", statusColor("connected"), "78ms"],
      ],
    );

    console.log();
    info("Identity: npub1...(your agent's public key)");

    console.log();

    // Funding status
    console.log(chalk.bold.underline("  Funding"));
    const balance = 12.5;
    const monthlyCost = 3.5;
    const runway = balance / monthlyCost;
    const runwayColor = runway > 3 ? chalk.green : runway > 1 ? chalk.yellow : chalk.red;

    table(
      ["Property", "Value"],
      [
        ["AKT Balance", formatAKT(balance)],
        ["Monthly Cost", `~${formatAKT(monthlyCost)}`],
        ["Runway", runwayColor(`~${runway.toFixed(1)} months`)],
      ],
    );

    if (runway <= 1) {
      error("Low funds! Run 'hydraa fund' to top up.");
    } else if (runway <= 3) {
      warn("Consider topping up. Run 'hydraa fund' for details.");
    }

    console.log();

    // Memory status
    console.log(chalk.bold.underline("  Memory"));
    table(
      ["Property", "Value"],
      [
        ["Stored entries", "247"],
        ["Relay copies", "3 relays"],
        ["Last sync", "2 minutes ago"],
        ["Local cache", statusColor("ok")],
      ],
    );

    console.log();

    // Heartbeat status
    console.log(chalk.bold.underline("  Heartbeat"));
    table(
      ["Property", "Value"],
      [
        ["Status", statusColor("healthy")],
        ["Last check", "47 seconds ago"],
        ["Next check", "in 4 minutes"],
        ["Cheap checks", "288 today"],
        ["Alerts sent", "0 today"],
      ],
    );

    console.log();
  });
