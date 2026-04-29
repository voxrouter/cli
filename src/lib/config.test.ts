import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configFilePath, readConfig, writeConfig, type CliConfig } from "./config";

const sample: CliConfig = {
  version: 1,
  session_token: "vr_session_test_token_xxxxxxxx",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  user_id: "user_test_123",
  base_url: "https://api.voxrouter.ai",
};

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  // realpathSync canonicalizes /tmp → /private/tmp on macOS so the path
  // matches what os.homedir() returns when HOME is set to the tmp dir.
  tmpHome = realpathSync(mkdtempSync(join(tmpdir(), "vrcli-cfg-")));
  process.env.HOME = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe("writeConfig: bearer token file is never world-readable (postmortem #156 family)", () => {
  it("creates the file at mode 0o600", async () => {
    await writeConfig(sample);
    const s = await fsp.stat(configFilePath());
    expect(s.mode & 0o777).toBe(0o600);
  });

  // The regression case: writeFile's `mode` option is only honored on
  // create, so a stale config.json left at 0o644 by a pre-fix CLI would
  // be silently rewritten in place at the wider mode unless writeConfig
  // unlinks first. Pre-create at 0o644, then assert the result is 0o600.
  it("replaces a pre-existing wider-mode file with one at 0o600", async () => {
    const cfgPath = configFilePath();
    await fsp.mkdir(join(tmpHome, ".voxrouter"), { recursive: true, mode: 0o700 });
    await fsp.writeFile(cfgPath, "stale", { mode: 0o644 });

    await writeConfig(sample);

    const s = await fsp.stat(cfgPath);
    expect(s.mode & 0o777).toBe(0o600);
  });

  it("round-trips through readConfig", async () => {
    await writeConfig(sample);
    expect(await readConfig()).toEqual(sample);
  });
});

describe("readConfig: malformed input is treated as not-logged-in, never throws", () => {
  // Future-proofing: a config file written by a newer CLI carries a
  // version this CLI doesn't understand. Treat as "no config" — the user
  // gets the normal `voxrouter login` prompt rather than a crash.
  it("returns null for an unknown version", async () => {
    const cfgPath = configFilePath();
    await fsp.mkdir(join(tmpHome, ".voxrouter"), { recursive: true, mode: 0o700 });
    await fsp.writeFile(
      cfgPath,
      JSON.stringify({ ...sample, version: 99 }),
      { mode: 0o600 },
    );
    expect(await readConfig()).toBeNull();
  });

  // Disk corruption / partial write / hand-edit gone wrong. Same
  // contract: silently null, no throw.
  it("returns null for non-JSON content", async () => {
    const cfgPath = configFilePath();
    await fsp.mkdir(join(tmpHome, ".voxrouter"), { recursive: true, mode: 0o700 });
    await fsp.writeFile(cfgPath, "{ this is not json", { mode: 0o600 });
    expect(await readConfig()).toBeNull();
  });

  // No file at all — the cold-start case after a fresh install.
  it("returns null when the config file does not exist", async () => {
    expect(await readConfig()).toBeNull();
  });
});
