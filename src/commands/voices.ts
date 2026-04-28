import type { Command } from "commander";
import type { Voice, VoicesFilter } from "@voxrouter/sdk";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { table } from "../lib/format.js";

interface VoicesOptions {
  provider?: string;
  language?: string;
  gender?: string;
  json?: boolean;
}

export function voicesCommand(program: Command): void {
  program
    .command("voices")
    .description("List voices, optionally filtered by provider/language/gender.")
    .option("--provider <id>", "Comma-separated provider ids (e.g. elevenlabs,cartesia)")
    .option("--language <code>", "ISO language code (e.g. en-US, fr-FR)")
    .option("--gender <gender>", "Filter by labels.gender (e.g. female, male)")
    .option("--json", "Emit raw JSON instead of a table")
    .action(async (opts: VoicesOptions) => {
      const filter: VoicesFilter = {};
      if (opts.provider) {
        // CLI flag is comma-separated for ergonomics; SDK takes string[].
        filter.provider = opts.provider.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (opts.language) filter.language = opts.language;
      if (opts.gender) filter.gender = opts.gender;

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const voices = await client.voices.list(filter);

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(voices, null, 2)}\n`);
        return;
      }

      if (voices.length === 0) {
        process.stdout.write("No voices match these filters.\n");
        return;
      }

      const rows = voices.map((v: Voice) => [
        v.id,
        v.provider,
        v.name,
        v.language,
        v.labels.gender ?? "",
      ]);
      process.stdout.write(
        `${table(["ID", "PROVIDER", "NAME", "LANGUAGE", "GENDER"], rows)}\n`,
      );
    });
}
