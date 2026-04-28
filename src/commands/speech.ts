import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import type { SpeechRequest } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";

interface SpeechOptions {
  voice: string;
  model: string;
  format?: string;
  out?: string;
}

export function speechCommand(program: Command): void {
  program
    .command("speech <text>")
    .description("Synthesize speech via /v1/audio/speech.")
    .requiredOption("--voice <id>", "Provider-local voice id (use `voxrouter voices` to discover)")
    .requiredOption(
      "--model <provider/modelId>",
      "Model in the form provider/modelId (e.g. elevenlabs/eleven_turbo_v2_5)",
    )
    .option("--format <format>", "Response format: mp3 | pcm", "mp3")
    .option("--out <path>", "Write audio bytes to <path> (defaults to stdout)")
    .action(async (text: string, opts: SpeechOptions) => {
      const format = opts.format ?? "mp3";
      if (format !== "mp3" && format !== "pcm") {
        throw new CliError(`Unsupported --format '${format}' (allowed: mp3, pcm)`);
      }

      const req: SpeechRequest = {
        model: opts.model,
        voice: opts.voice,
        input: text,
        response_format: format,
      };

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);
      const blob = await client.audio.speech.create(req);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (opts.out) {
        await writeFile(opts.out, bytes);
        process.stderr.write(
          `Wrote ${bytes.byteLength} bytes (${format}) to ${opts.out}\n`,
        );
      } else {
        process.stdout.write(bytes);
      }
    });
}
