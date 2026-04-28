import type { Command } from "commander";
import type { ApiKeySummary } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";
import { table } from "../lib/format.js";

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

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
        return;
      }

      if (list.length === 0) {
        process.stdout.write("No API keys.\n");
        return;
      }

      const rows = list.map((k: ApiKeySummary) => [
        k.id,
        k.name,
        k.keySuffix,
        String(k.maxConcurrency),
        k.createdAt,
        k.lastUsedAt ?? "—",
      ]);
      process.stdout.write(
        `${table(
          ["ID", "NAME", "SUFFIX", "MAX CONC", "CREATED", "LAST USED"],
          rows,
        )}\n`,
      );
    });

  keys
    .command("create <name>")
    .description("Mint a new API key. The full key value is shown ONCE.")
    .option("--json", "Emit raw JSON instead of a human-readable summary")
    .action(async (name: string, opts: CreateOptions) => {
      if (!name || name.trim().length === 0) {
        throw new CliError("name is required");
      }
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const created = await client.keys.create(name);

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
        return;
      }

      // Print to stderr the framing/instructions; the secret itself goes
      // to stdout so users can pipe it (`voxrouter keys create ci | tee
      // .env`) without splicing the noise.
      process.stderr.write(
        `\nKey created: ${created.key.name} (id ${created.key.id}, suffix ${created.key.keySuffix})\n` +
          `Save this value NOW — the API will never echo it again:\n\n`,
      );
      process.stdout.write(`${created.secret}\n`);
    });

  keys
    .command("delete <id>")
    .description("Revoke an API key by id (creator-scoped).")
    .option("--json", "Emit raw JSON instead of a human-readable summary")
    .action(async (id: string, opts: DeleteOptions) => {
      if (!id || id.trim().length === 0) {
        throw new CliError("id is required");
      }
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });
      const result = await client.keys.delete(id);

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }

      process.stdout.write(`Revoked ${id}.\n`);
    });
}
