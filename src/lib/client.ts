import { VoxRouter, type VoxRouterOptions } from "@voxrouter/sdk";
import {
  configFilePath,
  isConfigValid,
  readConfig,
  type CliConfig,
} from "./config.js";

export interface GlobalCliOptions {
  baseUrl?: string;
}

/** Auth scope a command needs.
 *
 *   "data-plane"  — uses VOXROUTER_API_KEY (`pk_*`). Voices, speech,
 *                   providers, status, credits, activity.
 *
 *   "session"     — uses ~/.voxrouter/config.json's `vr_session_*`
 *                   token issued by `voxrouter login`. Whoami, logout,
 *                   keys.*. Falls back to VOXROUTER_API_KEY if no
 *                   session is configured AND the user explicitly set
 *                   the env var (some endpoints like whoami accept
 *                   either kind).
 *
 *   "none"        — no token; the SDK still needs a base URL though.
 *                   Used by `voxrouter login` itself for the
 *                   device-code + poll exchange.
 */
export type AuthMode = "data-plane" | "session" | "none";

export interface MakeClientOptions {
  /** Which auth path the command uses. Determines which token (if any)
   *  the SDK is constructed with. Default: "data-plane". */
  authMode?: AuthMode;
}

/**
 * Construct a `VoxRouter` SDK client with the right token for the command.
 *
 * Resolution order for the base URL (most specific wins):
 *   1. `--base-url` flag
 *   2. `VOXROUTER_BASE_URL` env var
 *   3. The `base_url` field on the saved CLI config (so `voxrouter
 *      logout` reaches the same env that issued the session)
 *   4. SDK default (`https://api.voxrouter.ai`)
 */
export async function makeClient(
  globals: GlobalCliOptions,
  opts: MakeClientOptions = {},
): Promise<VoxRouter> {
  const authMode = opts.authMode ?? "data-plane";
  const config = await readConfig();
  const baseURL =
    globals.baseUrl ??
    process.env.VOXROUTER_BASE_URL ??
    config?.base_url;

  let apiKey: string | undefined;

  if (authMode === "data-plane") {
    apiKey = process.env.VOXROUTER_API_KEY;
    if (!apiKey) {
      throw new CliError(
        "VOXROUTER_API_KEY is not set. Export your API key, e.g.:\n" +
          "  export VOXROUTER_API_KEY=pk_...",
      );
    }
  } else if (authMode === "session") {
    if (isConfigValid(config)) {
      apiKey = config.session_token;
    } else if (config && !isConfigValid(config)) {
      throw new CliError(
        `Your CLI session has expired. Run \`voxrouter login\` again to refresh.\n` +
          `(config: ${configFilePath()})`,
      );
    } else {
      // No login at all. Some session-mode endpoints (whoami) accept a
      // pk_* fallback — the server returns a different `auth=api_key`
      // identification but the call still works. For others (keys.*),
      // the server will 401 the pk_* and the CLI's error surface will
      // suggest `voxrouter login`.
      const fallback = process.env.VOXROUTER_API_KEY;
      if (fallback) {
        apiKey = fallback;
      } else {
        throw new CliError(
          "Not logged in. Run `voxrouter login` first.\n" +
            "(For pk_*-compatible commands, you can also export VOXROUTER_API_KEY.)",
        );
      }
    }
  }
  // authMode === "none": apiKey stays undefined; the SDK accepts that.

  const sdkOpts: VoxRouterOptions = {};
  if (apiKey) sdkOpts.apiKey = apiKey;
  if (baseURL) sdkOpts.baseURL = baseURL;
  return new VoxRouter(sdkOpts);
}

/** The session config the current CLI invocation is using, or null when
 *  no session is configured. Commands like `voxrouter logout` and
 *  `voxrouter whoami` need to read this for context (e.g. logout deletes
 *  the local file even if the server revoke fails). */
export async function currentSession(): Promise<CliConfig | null> {
  const config = await readConfig();
  return isConfigValid(config) ? config : null;
}

/** Resolve the base URL the CLI will use for THIS invocation, applying
 *  the same precedence as `makeClient`. Used by `voxrouter login` to
 *  pick which env to mint a session against. */
export function resolveBaseUrl(globals: GlobalCliOptions): string | undefined {
  return globals.baseUrl ?? process.env.VOXROUTER_BASE_URL;
}

export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}
