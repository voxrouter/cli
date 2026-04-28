import type { Command } from "commander";
import type { LedgerEntry } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { dollars, table } from "../lib/format.js";

interface ActivityOptions {
  limit?: string;
  json?: boolean;
}

export function activityCommand(program: Command): void {
  program
    .command("activity")
    .description("Recent wallet ledger entries from /v1/credits/activity.")
    .option("--limit <n>", "Maximum rows to return (1-100, default 50)")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: ActivityOptions) => {
      let limit: number | undefined;
      if (opts.limit !== undefined) {
        const parsed = Number.parseInt(opts.limit, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
          throw new CliError("--limit must be an integer between 1 and 100");
        }
        limit = parsed;
      }

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const rows = await client.credits.activity(
        limit !== undefined ? { limit } : undefined,
      );

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
        return;
      }

      if (rows.length === 0) {
        process.stdout.write("No ledger entries.\n");
        return;
      }

      const tableRows = rows.map((r: LedgerEntry) => [
        r.createdAt,
        r.kind,
        dollars(r.microsDelta),
        dollars(r.microsBalanceAfter),
        r.source,
      ]);
      process.stdout.write(
        `${table(
          ["CREATED", "KIND", "DELTA", "BALANCE AFTER", "SOURCE"],
          tableRows,
        )}\n`,
      );
    });
}
