#!/usr/bin/env node
import { Command } from "commander";
import { VoxRouterError } from "@voxrouter/sdk";
import { CliError } from "./lib/client.js";
import { voicesCommand } from "./commands/voices.js";
import { speechCommand } from "./commands/speech.js";
import { providersCommand } from "./commands/providers.js";
import { statusCommand } from "./commands/status.js";
import { creditsCommand } from "./commands/credits.js";
import { activityCommand } from "./commands/activity.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { keysCommand } from "./commands/keys.js";
import { billingCommand } from "./commands/billing.js";
import { usageCommand } from "./commands/usage.js";
import { updateCommand } from "./commands/update.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("voxrouter")
  .description("Official CLI for the VoxRouter TTS API.")
  .version(VERSION)
  .option(
    "--base-url <url>",
    "Override the API base URL (also reads VOXROUTER_BASE_URL).",
  );

// Auth + management commands (Phase 2 — `voxrouter login` flow).
loginCommand(program);
logoutCommand(program);
whoamiCommand(program);
keysCommand(program);
billingCommand(program);
usageCommand(program);

// Self-update (Phase 4 — native binary distribution).
updateCommand(program);

// Data-plane commands (Phase 1 — `pk_*` API key).
voicesCommand(program);
speechCommand(program);
providersCommand(program);
statusCommand(program);
creditsCommand(program);
activityCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(err.exitCode);
  }
  if (err instanceof VoxRouterError) {
    const detail = err.details ? ` - ${err.details}` : "";
    process.stderr.write(`Error ${err.status} ${err.code}${detail}\n`);
    // Friendly hint for the most-common confusion: a session-mode
    // command sent a stale or wrong-kind token. The server's 401 alone
    // doesn't tell the user what to do next.
    if (err.status === 401) {
      process.stderr.write(
        `Hint: this command requires a valid CLI session. Run \`voxrouter login\`.\n`,
      );
    }
    process.exit(1);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
