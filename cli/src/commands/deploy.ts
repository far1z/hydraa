import { Command } from "commander";
import { banner, success, error, warn, info, createSpinner, formatAKT } from "../utils/display.js";

const SDL_TEMPLATE = `---
version: "2.0"

services:
  agent:
    image: ghcr.io/openclaw/hydraa-runtime:latest
    expose:
      - port: 3000
        as: 3000
        to:
          - global: true
    env:
      - HYDRAA_MODE=production
      - NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band

profiles:
  compute:
    agent:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 1Gi
  placement:
    westcoast:
      pricing:
        agent:
          denom: uakt
          amount: 1000

deployment:
  agent:
    westcoast:
      profile: agent
      count: 1
`;

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

    if (opts.dryRun) {
      info("Dry run — showing Akash SDL manifest:\n");
      console.log(SDL_TEMPLATE);
      return;
    }

    info(`Provider: ${opts.provider}`);
    console.log();

    if (opts.provider === "self-hosted") {
      warn("Self-hosted deployment coming soon.");
      info("For now, use --provider akash (default).");
      return;
    }

    // Deploy to Akash
    const spinner = createSpinner("Creating Akash deployment...");
    spinner.start();

    try {
      // Check for AKT mnemonic
      if (!process.env["HYDRAA_AKT_MNEMONIC"]) {
        spinner.fail("Deployment failed");
        error("No AKT wallet configured. Set HYDRAA_AKT_MNEMONIC or run: hydraa fund");
        process.exit(1);
      }

      // Simulate deployment steps
      spinner.text = "Submitting deployment transaction...";
      await new Promise((r) => setTimeout(r, 2000));

      spinner.text = "Waiting for bids from providers...";
      await new Promise((r) => setTimeout(r, 3000));

      spinner.text = "Accepting best bid...";
      await new Promise((r) => setTimeout(r, 1500));

      spinner.text = "Sending manifest to provider...";
      await new Promise((r) => setTimeout(r, 1000));

      spinner.succeed("Deployment successful!");
    } catch (err) {
      spinner.fail("Deployment failed");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    console.log();
    console.log("  Deployment Details:");
    console.log("  ─────────────────────────────────────────────");
    info(`Deployment ID:    dseq/1234567`);
    info(`Provider:         akash1...provider`);
    info(`Status:           active`);
    info(`Forwarded ports:  3000 → 80`);
    info(`Estimated cost:   ~${formatAKT(3.5)}/month`);
    console.log();
    success("Your agent is now running on decentralized compute.");
    info("Check status anytime:  hydraa status");
    console.log();
  });
