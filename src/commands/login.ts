import type { Command } from "commander";
import { VoxRouterError } from "@voxrouter/sdk";
import {
  CliError,
  makeClient,
  resolveBaseUrl,
  type GlobalCliOptions,
} from "../lib/client.js";
import {
  CONFIG_FILE_VERSION,
  configFilePath,
  writeConfig,
} from "../lib/config.js";

const DEFAULT_BASE_URL = "https://api.voxrouter.ai";

interface LoginOptions {
  /** Override the device-code TTL polling cap. The server's TTL is the
   *  hard limit (10 min); this only stops the CLI sooner if the user
   *  abandons the flow. Defaults to the server-suggested expiry. */
  timeout?: string;
}

export function loginCommand(program: Command): void {
  program
    .command("login")
    .description(
      "Authorize this CLI against VoxRouter (device-code OAuth).",
    )
    .option(
      "--timeout <seconds>",
      "Stop polling after N seconds (default: server-issued expiry, ~10 min)",
    )
    .action(async (opts: LoginOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "none" });

      // Step 1: get a device-code pair from the API.
      let issuance;
      try {
        issuance = await client.auth.deviceCode();
      } catch (err) {
        if (err instanceof VoxRouterError) {
          throw new CliError(
            `Could not start login: ${err.code} (HTTP ${err.status})`,
          );
        }
        throw err;
      }

      const baseURL = resolveBaseUrl(globals) ?? DEFAULT_BASE_URL;
      process.stderr.write(
        `\nOpen this URL in your browser to authorize:\n\n` +
          `  ${issuance.verification_uri_complete}\n\n` +
          `Or paste this code at ${issuance.verification_uri}:\n\n` +
          `  ${issuance.user_code}\n\n` +
          `Waiting for approval (expires in ${issuance.expires_in}s)…\n`,
      );

      // Step 2: poll until approved / expired / timed out.
      const intervalMs = Math.max(1, issuance.interval) * 1000;
      const cliTimeout = opts.timeout
        ? Number.parseInt(opts.timeout, 10)
        : issuance.expires_in;
      if (!Number.isFinite(cliTimeout) || cliTimeout <= 0) {
        throw new CliError("--timeout must be a positive integer");
      }
      const deadline = Date.now() + cliTimeout * 1000;

      while (Date.now() < deadline) {
        const outcome = await client.auth.poll(issuance.device_code);

        if (outcome.kind === "approved") {
          await writeConfig({
            version: CONFIG_FILE_VERSION,
            session_token: outcome.session.session_token,
            expires_at: outcome.session.expires_at,
            user_id: outcome.session.user_id,
            base_url: baseURL,
          });
          process.stderr.write(
            `\nApproved. Session valid until ${outcome.session.expires_at}.\n` +
              `Stored in ${configFilePath()} (chmod 600).\n`,
          );
          return;
        }

        if (outcome.kind === "expired_token") {
          throw new CliError(
            "The device code expired before you approved it. Run `voxrouter login` again.",
          );
        }

        if (outcome.kind === "invalid_device_code") {
          throw new CliError(
            "The server rejected our device code as invalid — this is a bug. Re-run `voxrouter login`.",
          );
        }

        // authorization_pending — wait and re-poll.
        await sleep(intervalMs);
      }

      throw new CliError(
        "Timed out waiting for browser approval. Run `voxrouter login` again when ready.",
      );
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
