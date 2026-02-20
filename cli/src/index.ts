#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initCommand } from "./commands/init.js";
import { deployCommand } from "./commands/deploy.js";
import { statusCommand } from "./commands/status.js";
import { fundCommand } from "./commands/fund.js";
import { chatCommand } from "./commands/chat.js";
import { destroyCommand } from "./commands/destroy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Walk up from current file to find the nearest package.json */
function findPackageJson(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "package.json");
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error("Could not find package.json");
}

const pkg = JSON.parse(readFileSync(findPackageJson(), "utf-8"));

const program = new Command();

program
  .name("hydraa")
  .description("Make your OpenClaw agent unstoppable")
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(deployCommand);
program.addCommand(statusCommand);
program.addCommand(fundCommand);
program.addCommand(chatCommand);
program.addCommand(destroyCommand);

program.parse(process.argv);
