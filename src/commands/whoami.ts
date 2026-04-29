import type { Command } from "commander";
import { makeClient, type GlobalCliOptions } from "../lib/client.js";
import { printJsonOr } from "../lib/format.js";

interface WhoamiOptions {
  json?: boolean;
}

export function whoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description(
      "Show which user/account the CLI is currently authenticated as.",
    )
    .option("--json", "Emit raw JSON instead of a human-readable summary")
    .action(async (opts: WhoamiOptions) => {
      const globals = program.opts<GlobalCliOptions>();
      // session mode: prefers vr_session_* but accepts pk_* fallback —
      // /v1/auth/whoami works with both.
      const client = await makeClient(globals, { authMode: "session" });
      const me = await client.auth.whoami();

      printJsonOr(Boolean(opts.json), me, () => {
        const expiresLine =
          me.expires_at !== undefined && me.expires_at !== null
            ? `\nSession expires: ${me.expires_at}`
            : "";
        process.stdout.write(
          `Authenticated as: ${me.user_id}\n` +
            `Auth method:      ${me.auth}` +
            expiresLine +
            `\n`,
        );
      });
    });
}
