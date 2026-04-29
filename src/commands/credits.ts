import type { Command } from "commander";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { printWallet } from "../lib/format.js";

interface CreditsOptions {
  json?: boolean;
}

export function creditsCommand(program: Command): void {
  program
    .command("credits")
    .description("Show wallet snapshot from /v1/credits.")
    .option("--json", "Emit raw JSON instead of a summary")
    .action(async (opts: CreditsOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const wallet = await client.credits.get();
      printWallet(wallet, Boolean(opts.json));
    });
}
