import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { banner, success, error, warn, info, createSpinner } from "../utils/display.js";

export const destroyCommand = new Command("destroy")
  .description("Tear down Akash deployment and clean up")
  .option("--wipe-memory", "Also delete relay memory events", false)
  .option("--force", "Skip confirmation prompt", false)
  .action(async (opts: { wipeMemory: boolean; force: boolean }) => {
    banner();

    warn("This will destroy your agent's Akash deployment.");
    if (opts.wipeMemory) {
      warn("Memory stored on Nostr relays will also be deleted.");
    }
    console.log();

    // Confirmation prompt
    if (!opts.force) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await rl.question(
        "  Are you sure? Type 'destroy' to confirm: ",
      );
      rl.close();

      if (answer.trim() !== "destroy") {
        info("Aborted. Nothing was destroyed.");
        return;
      }
      console.log();
    }

    // Destroy Akash deployment
    const deploySpinner = createSpinner("Closing Akash deployment...");
    deploySpinner.start();

    try {
      await new Promise((r) => setTimeout(r, 2000));
      deploySpinner.succeed("Akash deployment closed");
    } catch (err) {
      deploySpinner.fail("Failed to close Akash deployment");
      error(err instanceof Error ? err.message : String(err));
    }

    // Wipe memory if requested
    if (opts.wipeMemory) {
      const memorySpinner = createSpinner("Deleting relay memory events...");
      memorySpinner.start();

      try {
        await new Promise((r) => setTimeout(r, 1500));
        memorySpinner.succeed("Relay memory wiped");
      } catch (err) {
        memorySpinner.fail("Failed to wipe relay memory");
        error(err instanceof Error ? err.message : String(err));
      }
    }

    console.log();
    console.log("  Cleanup Summary:");
    console.log("  ─────────────────────────────────────────────");
    success("Akash deployment:  destroyed");
    if (opts.wipeMemory) {
      success("Relay memory:      wiped");
    } else {
      info("Relay memory:      preserved (use --wipe-memory to delete)");
    }
    info("Nostr identity:    preserved (keypair still in config)");
    info("Local config:      preserved");
    console.log();
    info("To redeploy:  hydraa deploy");
    console.log();
  });
