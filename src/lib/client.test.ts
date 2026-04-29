import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CliError, makeClient, resolveBaseUrl } from "./client";
import { configFilePath, type CliConfig, writeConfig } from "./config";

const validSession: CliConfig = {
  version: 1,
  session_token: "vr_session_test_token_xxxxxxxx",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  user_id: "user_test",
  base_url: "https://api.voxrouter.ai",
};

let tmpHome: string;
let originalHome: string | undefined;
let originalApiKey: string | undefined;
let originalBaseUrl: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  originalApiKey = process.env.VOXROUTER_API_KEY;
  originalBaseUrl = process.env.VOXROUTER_BASE_URL;
  tmpHome = realpathSync(mkdtempSync(join(tmpdir(), "vrcli-client-")));
  process.env.HOME = tmpHome;
  delete process.env.VOXROUTER_API_KEY;
  delete process.env.VOXROUTER_BASE_URL;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalApiKey === undefined) delete process.env.VOXROUTER_API_KEY;
  else process.env.VOXROUTER_API_KEY = originalApiKey;
  if (originalBaseUrl === undefined) delete process.env.VOXROUTER_BASE_URL;
  else process.env.VOXROUTER_BASE_URL = originalBaseUrl;
});

describe("resolveBaseUrl precedence: --base-url flag > VOXROUTER_BASE_URL > config > SDK default", () => {
  it("prefers the --base-url flag over the env var", () => {
    process.env.VOXROUTER_BASE_URL = "https://env.example";
    expect(resolveBaseUrl({ baseUrl: "https://flag.example" })).toBe(
      "https://flag.example",
    );
  });

  it("falls back to VOXROUTER_BASE_URL when no flag is set", () => {
    process.env.VOXROUTER_BASE_URL = "https://env.example";
    expect(resolveBaseUrl({})).toBe("https://env.example");
  });

  it("returns undefined (so the SDK default kicks in) when nothing is set", () => {
    expect(resolveBaseUrl({})).toBeUndefined();
  });
});

describe("makeClient: data-plane mode requires VOXROUTER_API_KEY", () => {
  it("throws CliError when VOXROUTER_API_KEY is unset", async () => {
    await expect(
      makeClient({}, { authMode: "data-plane" }),
    ).rejects.toBeInstanceOf(CliError);
  });

  it("error message points the user at the env var", async () => {
    try {
      await makeClient({}, { authMode: "data-plane" });
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).message).toContain("VOXROUTER_API_KEY");
      return;
    }
    throw new Error("expected CliError");
  });

  it("succeeds when VOXROUTER_API_KEY is set", async () => {
    process.env.VOXROUTER_API_KEY = "pk_live_test";
    await expect(makeClient({}, { authMode: "data-plane" })).resolves.toBeDefined();
  });
});

describe("makeClient: session mode reads ~/.voxrouter/config.json", () => {
  it("succeeds when a fresh session config exists", async () => {
    await writeConfig(validSession);
    await expect(makeClient({}, { authMode: "session" })).resolves.toBeDefined();
  });

  it("throws CliError with an expiry message when the session config has expired", async () => {
    const expired: CliConfig = {
      ...validSession,
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    };
    await fsp.mkdir(join(tmpHome, ".voxrouter"), { recursive: true, mode: 0o700 });
    await fsp.writeFile(configFilePath(), JSON.stringify(expired), { mode: 0o600 });

    try {
      await makeClient({}, { authMode: "session" });
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).message).toContain("expired");
      return;
    }
    throw new Error("expected CliError");
  });

  it("falls back to VOXROUTER_API_KEY when no session config exists", async () => {
    process.env.VOXROUTER_API_KEY = "pk_live_test";
    await expect(makeClient({}, { authMode: "session" })).resolves.toBeDefined();
  });

  it("throws when there is neither a session nor an API key", async () => {
    await expect(
      makeClient({}, { authMode: "session" }),
    ).rejects.toBeInstanceOf(CliError);
  });
});

describe("makeClient: none mode skips auth entirely", () => {
  it("succeeds with no env vars and no config", async () => {
    // `authMode: "none"` is what `voxrouter login` uses pre-session —
    // device-code endpoints don't need a token and the SDK accepts the
    // no-token construction.
    await expect(makeClient({}, { authMode: "none" })).resolves.toBeDefined();
  });
});

describe("CliError exit-code contract (1=runtime, 2=usage, no default)", () => {
  it("carries the supplied exit code", () => {
    const runtime = new CliError("network down", 1);
    const usage = new CliError("bad flag", 2);
    expect(runtime.exitCode).toBe(1);
    expect(usage.exitCode).toBe(2);
  });

  it("forwards the message to Error.message", () => {
    const e = new CliError("oh no", 1);
    expect(e.message).toBe("oh no");
    expect(e).toBeInstanceOf(Error);
  });

  it("requires an explicit exit code at compile time", () => {
    // The default-1 was deleted in the C4 contract pass — every
    // construction has to pick 1 (runtime) or 2 (usage) deliberately.
    // This @ts-expect-error is the regression test: if someone restores
    // the default, this line stops erroring and the test fails.
    // @ts-expect-error - exitCode is required
    void new CliError("missing code");
  });

  it("rejects exit codes outside the typed union at compile time", () => {
    // Only 1 and 2 are valid CliExitCode values. 137, 255, etc. would
    // be misuses of CliError.
    // @ts-expect-error - 137 is not assignable to CliExitCode
    void new CliError("nope", 137);
  });
});
