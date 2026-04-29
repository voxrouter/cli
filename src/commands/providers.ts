import type { Command } from "commander";
import type { ProviderInfo, ProviderModel } from "@voxrouter/sdk";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { printJsonOr, table } from "../lib/format.js";

interface ProvidersOptions {
  json?: boolean;
}

export function providersCommand(program: Command): void {
  program
    .command("providers")
    .description("List routable providers and their models.")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: ProvidersOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const providers = await client.providers.list();

      // Each provider expands to N rows (one per model), so this isn't a
      // straight printList — `project` is 1:1 row-to-row, but we want to
      // explode. Use `printJsonOr` and build the flat table manually.
      printJsonOr(Boolean(opts.json), providers, () => {
        const rows = providers.flatMap((p: ProviderInfo) =>
          p.models.map((m: ProviderModel) => [
            p.id,
            p.name,
            m.id,
            m.response_formats.join(","),
            p.website,
          ]),
        );
        process.stdout.write(
          `${table(
            ["PROVIDER", "PROVIDER NAME", "MODEL", "FORMATS", "WEBSITE"],
            rows,
          )}\n`,
        );
      });
    });
}
