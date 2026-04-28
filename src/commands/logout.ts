import type { Command } from "commander";
import { VoxRouterError } from "@voxrouter/sdk";
import {
  currentSession,
  makeClient,
  type GlobalCliOptions,
} from "../lib/client.js";
import { clearConfig, configFilePath } from "../lib/config.js";

export function logoutCommand(program: Command): void {
  program
    .command("logout")
    .description(
      "Revoke this CLI's session token and remove the local config file.",
    )
    .action(async () => {
      const session = await currentSession();
      if (!session) {
        // No local config to revoke. Friendly, idempotent — same exit
        // code as a successful logout. The user typed `voxrouter logout`
        // and now they are, in fact, logged out.
        process.stderr.write("Not logged in (no session to revoke).\n");
        return;
      }

      const globals = program.opts<GlobalCliOptions>();
      const client = await makeClient(globals, { authMode: "session" });

      // Server-side revoke FIRST. Local cleanup runs unconditionally
      // afterwards so a network error doesn't leave the user in a state
      // where the local config still has a token but the server has
      // already revoked it.
      let serverRevoked = false;
      let serverError: string | null = null;
      try {
        const result = await client.auth.logout();
        serverRevoked = result.revoked;
      } catch (err) {
        if (err instanceof VoxRouterError) {
          serverError = `${err.code} (HTTP ${err.status})`;
        } else {
          serverError = err instanceof Error ? err.message : String(err);
        }
      }

      const localCleared = await clearConfig();

      if (serverError) {
        process.stderr.write(
          `Server revoke failed: ${serverError}\n` +
            `Local config ${localCleared ? "removed" : "was already absent"} ` +
            `(${configFilePath()}).\n` +
            `The session token may still be valid until its 90-day TTL expires.\n`,
        );
        // Non-zero so scripts can detect partial failure.
        process.exitCode = 1;
        return;
      }

      process.stderr.write(
        `Logged out. ${serverRevoked ? "Session revoked server-side. " : ""}` +
          `Local config removed (${configFilePath()}).\n`,
      );
    });
}
