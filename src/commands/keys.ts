import type { Command } from "commander";
import type { ApiKeySummary } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { printJsonOr, printList } from "../lib/format.js";

interface ListOptions {
  json?: boolean;
}

interface CreateOptions {
  json?: boolean;
}

interface DeleteOptions {
  json?: boolean;
}

export function keysCommand(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage API keys for the authenticated user.");

  keys
    .command("list")
    .description("List API keys for the caller's organization.")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: ListOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const list = await client.keys.list();

      printList<ApiKeySummary>({
        rows: list,
        json: Boolean(opts.json),
        headers: ["ID", "NAME", "SUFFIX", "MAX CONC", "CREATED", "LAST USED"],
        project: (k) => [
          k.id,
          k.name,
          k.keySuffix,
          String(k.maxConcurrency),
          k.createdAt,
          k.lastUsedAt ?? "—",
        ],
        empty: "No API keys.",
      });
    });

  keys
    .command("create <name>")
    .description("Mint a new API key. The full key value is shown ONCE.")
    .option("--json", "Emit raw JSON instead of a human-readable summary")
    .action(async (name: string, opts: CreateOptions) => {
      if (!name || name.trim().length === 0) {
        throw new CliError("name is required", 2);
      }
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const created = await client.keys.create(name);

      // The secret-printing path is intentionally split across stderr and
      // stdout, which doesn't fit the printJsonOr/printList shape — JSON
      // mode dumps everything; text mode prints framing on stderr and the
      // raw secret on stdout (so `voxrouter keys create ci > .env` works).
      printJsonOr(Boolean(opts.json), created, () => {
        process.stderr.write(
          `\nKey created: ${created.key.name} (id ${created.key.id}, suffix ${created.key.keySuffix})\n` +
            `Save this value NOW — the API will never echo it again:\n\n`,
        );
        process.stdout.write(`${created.secret}\n`);
      });
    });

  keys
    .command("delete <id>")
    .description("Revoke an API key by id (creator-scoped).")
    .option("--json", "Emit raw JSON instead of a human-readable summary")
    .action(async (id: string, opts: DeleteOptions) => {
      if (!id || id.trim().length === 0) {
        throw new CliError("id is required", 2);
      }
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      await client.keys.delete(id);

      printJsonOr(Boolean(opts.json), { deleted: true, id }, () => {
        process.stdout.write(`Revoked ${id}.\n`);
      });
    });
}
