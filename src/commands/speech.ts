import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Command } from "commander";
import type { SpeechRequest } from "@voxrouter/sdk";
import { CliError, makeClient, type GlobalCliOptions } from "../lib/client.js";

interface SpeechOptions {
  voice: string;
  model: string;
  format?: string;
  out?: string;
  providerOptions?: string;
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
    .option(
      "--format <format>",
      "Response format. Today: mp3 | pcm (the SDK's typed surface). Server may accept more once the SDK type loosens.",
      "mp3",
    )
    .option("--out <path>", "Write audio bytes to <path> (defaults to stdout)")
    .option(
      "--provider-options <json>",
      "JSON object passed through to the provider as `provider_options`. Shape depends on the provider; consult the provider adapter docs.",
    )
    .action(async (text: string, opts: SpeechOptions) => {
      const format = assertResponseFormat(opts.format ?? "mp3");
      const providerOptions = parseProviderOptions(opts.providerOptions);

      const req: SpeechRequest = {
        model: opts.model,
        voice: opts.voice,
        input: text,
        response_format: format,
        ...(providerOptions ? { provider_options: providerOptions } : {}),
      };

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals);

      // SIGINT plumbing: an AbortController hooked into pipeline. Ctrl-C
      // aborts the pipeline, which calls cancel() on the source stream
      // (the fetch body). The fetch terminates, the destination closes,
      // and we exit 130 — no Node unhandled-rejection trace.
      const ac = new AbortController();
      const sigintHandler = () => ac.abort();
      process.on("SIGINT", sigintHandler);

      try {
        const resp = await client.audio.speech.createRaw(req);
        if (!resp.body) {
          throw new CliError(
            "server returned an empty body — no audio to write",
            1,
          );
        }

        // ReadableStream<Uint8Array> (web) → Node Readable. Both Node 18+
        // (Readable.fromWeb) and the WHATWG fetch in Bun-compiled binaries
        // expose this bridge.
        const source = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0]);
        const dest = opts.out ? createWriteStream(opts.out) : process.stdout;

        // Don't auto-close stdout — closing it kills further writes from
        // the same process (e.g. the trailing "Wrote …" notice on stderr
        // is fine because that's a different stream). For files we DO
        // want auto-close so the FD is released on completion.
        await pipeline(source, dest, { signal: ac.signal, end: opts.out !== undefined });

        if (opts.out) {
          process.stderr.write(`Wrote audio (${format}) to ${opts.out}\n`);
        }
      } catch (err) {
        if (ac.signal.aborted) {
          // Standard SIGINT exit code per POSIX. Suppress the abort
          // exception — the user asked for it.
          process.exit(130);
        }
        throw err;
      } finally {
        process.off("SIGINT", sigintHandler);
      }
    });
}

/** Type guard for `--format`. The SDK currently narrows
 *  `response_format` to `"mp3" | "pcm"`; until the SDK broadens, the CLI
 *  has to enforce the same. Failure is a usage error (exit code 2). */
function assertResponseFormat(value: string): "mp3" | "pcm" {
  if (value !== "mp3" && value !== "pcm") {
    throw new CliError(
      `Unsupported --format '${value}'. Today the SDK only accepts 'mp3' or 'pcm'.`,
      2,
    );
  }
  return value;
}

/** Parse the `--provider-options` JSON. Strict: must be an object,
 *  not a primitive or array. Failure is a usage error (exit code 2). */
function parseProviderOptions(
  raw: string | undefined,
): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new CliError(
      `--provider-options is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      2,
    );
  }
  if (!isJsonObject(parsed)) {
    throw new CliError(
      "--provider-options must be a JSON object (e.g. '{\"foo\":\"bar\"}')",
      2,
    );
  }
  return parsed;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
