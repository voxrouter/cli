import type { Command } from "commander";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { dollars } from "../lib/format.js";

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

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(wallet, null, 2)}\n`);
        return;
      }

      const available = wallet.balanceMicros - wallet.reservedMicros;
      process.stdout.write(
        `Balance:   ${dollars(wallet.balanceMicros)}\n` +
          `Reserved:  ${dollars(wallet.reservedMicros)}\n` +
          `Available: ${dollars(available)}\n`,
      );
    });
}
