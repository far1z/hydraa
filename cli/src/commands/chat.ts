import { Command } from "commander";
import { createInterface } from "node:readline";
import chalk from "chalk";
import { banner, info, warn, error, createSpinner } from "../utils/display.js";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

export const chatCommand = new Command("chat")
  .description("Interactive Nostr DM chat with your agent")
  .option("--relay <url...>", "Override default relays")
  .action(async (opts: { relay?: string[] }) => {
    banner();

    const relays = opts.relay ?? DEFAULT_RELAYS;

    info("Connecting to your agent via Nostr DMs...\n");
    info(`Relays: ${relays.join(", ")}`);
    console.log();

    const spinner = createSpinner("Connecting to relays...");
    spinner.start();

    try {
      // Simulate relay connection
      await new Promise((r) => setTimeout(r, 1500));
      spinner.succeed("Connected to relays");
    } catch (err) {
      spinner.fail("Failed to connect");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    console.log();
    info("Chat session started. Type your message and press Enter.");
    info("Press Ctrl+C to exit.\n");
    console.log(chalk.dim("  ─────────────────────────────────────────────\n"));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan("  you > "),
    });

    rl.prompt();

    rl.on("line", async (line) => {
      const message = line.trim();
      if (!message) {
        rl.prompt();
        return;
      }

      // Show sending indicator
      const sendSpinner = createSpinner("Sending...");
      sendSpinner.start();

      try {
        // Simulate sending encrypted DM
        await new Promise((r) => setTimeout(r, 500));
        sendSpinner.stop();

        // Simulate receiving response
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

        console.log(
          chalk.green("  agent > ") +
            chalk.white(`[Response to "${message}" would appear here via Nostr DM]`),
        );
        console.log();
      } catch (err) {
        sendSpinner.fail("Failed to send");
        warn("Retrying on next message...");
      }

      rl.prompt();
    });

    rl.on("close", () => {
      console.log();
      info("Chat session ended.");
      process.exit(0);
    });

    // Handle Ctrl+C gracefully
    process.on("SIGINT", () => {
      console.log();
      info("Disconnecting...");
      rl.close();
    });
  });
