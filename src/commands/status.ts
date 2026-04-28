import type { Command } from "commander";
import type { ProviderHealth } from "@voxrouter/sdk";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { table } from "../lib/format.js";

interface StatusOptions {
  json?: boolean;
}

export function statusCommand(program: Command): void {
  program
    .command("status")
    .description("Per-provider live health from /v1/status.")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: StatusOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const providers = await client.status.get();

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(providers, null, 2)}\n`);
        return;
      }

      const rows = providers.map((p: ProviderHealth) => [
        p.id,
        p.state,
        p.reason ?? "",
      ]);
      process.stdout.write(
        `${table(["PROVIDER", "STATE", "REASON"], rows)}\n`,
      );
    });
}
