import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// `~/.voxrouter/config.json` — written by `voxrouter login`, read by every
// management command, deleted by `voxrouter logout`.
//
// Format:
//   {
//     "version": 1,
//     "session_token": "vr_session_...",
//     "expires_at": "2026-07-26T...",
//     "user_id": "...",
//     "base_url": "https://api.voxrouter.ai"
//   }
//
// `version` is here so we can evolve the format later without crashing
// older CLIs reading newer files (or vice versa). Today only `1` is
// recognized; unknown versions are treated as "no config" (the user gets
// a normal "run voxrouter login" error rather than a crash).

export const CONFIG_FILE_VERSION = 1;

export interface CliConfig {
  version: number;
  session_token: string;
  expires_at: string;
  user_id: string;
  /** Base URL the session was minted against. The CLI uses this when the
   *  caller didn't pass `--base-url` / set `VOXROUTER_BASE_URL`, so
   *  `voxrouter logout` reaches the same env that issued the token. */
  base_url: string;
}

function configDir(): string {
  return join(homedir(), ".voxrouter");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

/** Read the persisted CLI config, or null if no login has happened (or
 *  the file is malformed / from a future version). */
export async function readConfig(): Promise<CliConfig | null> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf-8");
  } catch (err) {
    // ENOENT is the normal "not logged in" case. Anything else (perm
    // denied, IO error) we surface as null — the CLI prints a generic
    // "run voxrouter login" message rather than a stack trace, and the
    // user can investigate ~/.voxrouter/ themselves if they need to.
    if (isNotFound(err)) return null;
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isCliConfig(parsed)) return null;
  if (parsed.version !== CONFIG_FILE_VERSION) return null;
  return parsed;
}

/** Write the config file with restrictive permissions. The token is a
 *  bearer credential — anyone with read access on `~/.voxrouter/config.json`
 *  can call the API as the user until the 90-day TTL expires.
 *
 *  The file is created with mode 0o600 in a single syscall: any write-
 *  then-chmod sequence opens a race window where the file briefly sits
 *  at the umask default (0o644 on most systems) and another local user
 *  on a shared host can read the token before chmod tightens it. This
 *  is the same shape of "claimed success but the safety step never
 *  applied" bug as postmortem #156 (drizzle migrator silently no-op'd
 *  while logging "applied"). Close the window at creation time.
 *
 *  The unlink first matters because writeFile's `mode` option is only
 *  honored when the file is *created*. A stale config.json left at
 *  mode 0o644 by a pre-fix CLI version would be silently rewritten in
 *  place with the original mode preserved. ENOENT (no pre-existing
 *  file) is the normal fresh-install path and is ignored. */
export async function writeConfig(config: CliConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  try {
    await unlink(configPath());
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  await writeFile(configPath(), JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/** Delete the config file. Idempotent: returns false if the file didn't
 *  exist in the first place. Used by `voxrouter logout` after the server
 *  revoke succeeds (or fails — local cleanup is unconditional). */
export async function clearConfig(): Promise<boolean> {
  try {
    await unlink(configPath());
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function isCliConfig(value: unknown): value is CliConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "number" &&
    typeof v.session_token === "string" &&
    typeof v.expires_at === "string" &&
    typeof v.user_id === "string" &&
    typeof v.base_url === "string"
  );
}

/** True if the config exists and the token has not expired. Callers
 *  treat false the same way as "no config" — both lead to "run
 *  voxrouter login". */
export function isConfigValid(config: CliConfig | null): config is CliConfig {
  if (!config) return false;
  const expiresAt = new Date(config.expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > Date.now();
}

/** Path to the config file — exposed for error messages and tests. */
export function configFilePath(): string {
  return configPath();
}
