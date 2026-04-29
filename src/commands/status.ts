import type { Command } from "commander";
import type { ProviderHealth } from "@voxrouter/sdk";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { printList } from "../lib/format.js";

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

      printList<ProviderHealth>({
        rows: providers,
        json: Boolean(opts.json),
        headers: ["PROVIDER", "STATE", "REASON"],
        project: (p) => [p.id, p.state, p.reason ?? ""],
        empty: "No providers reported.",
      });
    });
}
