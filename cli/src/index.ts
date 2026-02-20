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

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"),
);

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
