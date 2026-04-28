import type { Command } from "commander";
import type { UsageSummary } from "@voxrouter/sdk";

// Reach into the summary shape rather than separately re-exporting the
// row types from the SDK — keeps the SDK's public surface tight.
type UsageProviderRow = UsageSummary["byProvider"][number];
type UsageErrorRow = UsageSummary["byErrorCode"][number];
type UsageRecentRow = UsageSummary["recent"][number];
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { dollars, table } from "../lib/format.js";

interface UsageOptions {
  days?: string;
  limit?: string;
  /** Drill-down view to print as the primary section. Default `provider`
   *  (matches the dashboard). */
  by?: "provider" | "error" | "recent";
  json?: boolean;
}

export function usageCommand(program: Command): void {
  program
    .command("usage")
    .description("Aggregated usage breakdown over a recent window.")
    .option(
      "--days <n>",
      "Window size in days (1–365, default 30)",
    )
    .option(
      "--limit <n>",
      "Max ledger rows to read before aggregation (1–1000, default 100)",
    )
    .option(
      "--by <view>",
      "Primary view: provider | error | recent (default provider)",
      "provider",
    )
    .option("--json", "Emit raw JSON instead of tables")
    .action(async (opts: UsageOptions) => {
      const days = parseRange(opts.days, "days", 1, 365);
      const limit = parseRange(opts.limit, "limit", 1, 1000);
      const view = opts.by ?? "provider";
      if (view !== "provider" && view !== "error" && view !== "recent") {
        throw new CliError(
          "--by must be one of: provider, error, recent",
        );
      }

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const filter: { days?: number; limit?: number } = {};
      if (days !== undefined) filter.days = days;
      if (limit !== undefined) filter.limit = limit;
      const summary = await client.usage.get(
        Object.keys(filter).length > 0 ? filter : undefined,
      );

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
        return;
      }

      printSummary(summary, view);
    });
}

function parseRange(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new CliError(`--${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function printSummary(
  summary: UsageSummary,
  view: "provider" | "error" | "recent",
): void {
  const { totals, byProvider, byErrorCode, recent } = summary;

  process.stdout.write(
    `Totals\n` +
      `  Requests:    ${totals.requests}\n` +
      `  Spent:       ${dollars(totals.costMicros)}\n` +
      `  Errors:      ${totals.errorCount}\n\n`,
  );

  if (view === "provider") {
    process.stdout.write(`By provider\n`);
    if (byProvider.length === 0) {
      process.stdout.write("  (no usage in window)\n");
    } else {
      const rows = byProvider.map((p: UsageProviderRow) => [
        p.provider,
        String(p.requests),
        dollars(p.costMicros),
      ]);
      process.stdout.write(
        `${table(["PROVIDER", "REQUESTS", "COST"], rows)}\n`,
      );
    }
  } else if (view === "error") {
    process.stdout.write(`By error code\n`);
    if (byErrorCode.length === 0) {
      process.stdout.write("  (no errors in window)\n");
    } else {
      const rows = byErrorCode.map((e: UsageErrorRow) => [
        e.code,
        String(e.count),
      ]);
      process.stdout.write(`${table(["CODE", "COUNT"], rows)}\n`);
    }
  } else {
    process.stdout.write(`Recent\n`);
    if (recent.length === 0) {
      process.stdout.write("  (no recent activity in window)\n");
    } else {
      const rows = recent.map((r: UsageRecentRow) => [
        r.createdAt,
        r.status,
        r.provider ?? "—",
        dollars(r.costMicros),
        r.code ?? "—",
      ]);
      process.stdout.write(
        `${table(
          ["WHEN", "STATUS", "PROVIDER", "COST", "CODE"],
          rows,
        )}\n`,
      );
    }
  }
}
