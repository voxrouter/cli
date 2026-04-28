import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";

const REPO = "voxrouter/cli";
const VERSION = "0.1.0";

interface UpdateOptions {
  json?: boolean;
  check?: boolean;
  to?: string;
}

interface ManifestEntry {
  file: string;
  size: number;
  sha256: string;
}

interface ReleaseManifest {
  version: string;
  builtAt?: string;
  binaries: Record<string, ManifestEntry>;
}

function detectPlatform(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "darwin") return `darwin-${arch}`;
  if (process.platform === "linux") {
    // The bash installer's musl detection ran at install time. At update
    // time, prefer the same platform the binary already came from. We can't
    // reliably probe musl here without forking a subprocess, so fall back to
    // glibc and let the user override via a future flag if it ever bites.
    return `linux-${arch}`;
  }
  if (process.platform === "win32") return "windows-x64";
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
}

async function fetchLatestTag(): Promise<string> {
  // GitHub redirects /releases/latest. We follow it and parse the redirect
  // target rather than calling the API (no auth, no rate limit headache).
  const res = await fetch(`https://github.com/${REPO}/releases/latest`, {
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to query latest release: ${res.status} ${res.statusText}`);
  }
  const m = res.url.match(/\/tag\/(v\d[^/]*)$/);
  if (!m) {
    throw new Error(`Could not parse release tag from ${res.url}`);
  }
  return m[1] ?? "";
}

async function fetchManifest(tag: string): Promise<ReleaseManifest> {
  const url = `https://github.com/${REPO}/releases/download/${tag}/manifest.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download manifest: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ReleaseManifest;
}

async function downloadAndVerify(url: string, expectedSha256: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `SHA256 mismatch on download: expected ${expectedSha256}, got ${actual}`,
    );
  }
  return buf;
}

function locateRunningBinary(): string | null {
  // process.execPath is the running binary when launched via Bun-compiled
  // single-file binary. When launched via `node bin.js` (npm wrapper path),
  // execPath is the user's node binary — in that case self-update is a
  // no-op (npm owns the version) and we surface a clear error.
  const ep = process.execPath;
  if (!ep) return null;
  const base = ep.split(/[\\/]/).pop() || "";
  if (base.startsWith("voxrouter")) return ep;
  return null;
}

function atomicReplace(targetPath: string, newBuffer: Buffer): void {
  const dir = dirname(targetPath);
  const tmp = mkdtempSync(resolve(tmpdir(), "voxrouter-update-"));
  const stagedPath = resolve(tmp, "voxrouter-new");
  try {
    writeFileSync(stagedPath, newBuffer);
    chmodSync(stagedPath, 0o755);
    // rename within the tmpdir then move to target — keeps the swap atomic
    // on the same filesystem. If they're on different filesystems
    // (e.g. /tmp on tmpfs), fall back to a same-dir staging file.
    try {
      renameSync(stagedPath, targetPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EXDEV") {
        const sameDirStaged = resolve(dir, ".voxrouter.new");
        writeFileSync(sameDirStaged, newBuffer);
        chmodSync(sameDirStaged, 0o755);
        renameSync(sameDirStaged, targetPath);
      } else {
        throw e;
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function updateCommand(program: Command): void {
  program
    .command("update")
    .description("Update this CLI to the latest released version.")
    .option("--check", "Check for updates without downloading")
    .option("--to <version>", "Install a specific version instead of the latest")
    .option("--json", "Emit machine-readable output")
    .action(async (opts: UpdateOptions) => {
      const platform = detectPlatform();
      const tag = opts.to
        ? `v${opts.to.replace(/^v/, "")}`
        : await fetchLatestTag();
      const targetVersion = tag.replace(/^v/, "");
      const isUpToDate = targetVersion === VERSION && !opts.to;

      if (opts.json) {
        process.stdout.write(
          `${JSON.stringify({
            currentVersion: VERSION,
            latestVersion: targetVersion,
            upToDate: isUpToDate,
            platform,
          }, null, 2)}\n`,
        );
        if (opts.check || isUpToDate) return;
      } else {
        process.stdout.write(`Current: ${VERSION}\nLatest:  ${targetVersion}\n`);
        if (isUpToDate) {
          process.stdout.write("Already up to date.\n");
          return;
        }
        if (opts.check) {
          process.stdout.write(`Run 'voxrouter update' to install ${targetVersion}.\n`);
          return;
        }
      }

      const targetPath = locateRunningBinary();
      if (!targetPath) {
        // npm-installed CLI: the user runs the platform-specific binary
        // through node bin.js, and process.execPath is node, not voxrouter.
        // Self-update can't replace the binary without disturbing npm's
        // package layout. Surface a clear next step instead.
        const msg =
          "Cannot self-update: this CLI was installed via npm. " +
          "Run `npm install -g @voxrouter/cli@latest` instead, " +
          "or use the standalone installer:\n" +
          "  curl -fsSL https://voxrouter.ai/install | bash";
        process.stderr.write(`${msg}\n`);
        process.exit(2);
      }

      const manifest = await fetchManifest(tag);
      const entry = manifest.binaries[platform];
      if (!entry) {
        throw new Error(`Release ${tag} has no binary for platform ${platform}`);
      }

      const assetUrl = `https://github.com/${REPO}/releases/download/${tag}/${entry.file}`;
      process.stdout.write(`Downloading ${entry.file} (${(entry.size / 1024 / 1024).toFixed(1)} MB)…\n`);
      const buf = await downloadAndVerify(assetUrl, entry.sha256);

      atomicReplace(targetPath, buf);
      process.stdout.write(`Updated ${targetPath} to ${targetVersion}.\n`);

      // Sanity check: can we exec the new binary?
      if (!opts.json) {
        const verify = spawnSync(targetPath, ["--version"], { encoding: "utf8" });
        if (verify.status === 0) {
          const reported = (verify.stdout || "").trim();
          process.stdout.write(`Verified: ${reported}\n`);
        }
      }
    });
}

// Re-exported so the index.ts version flag stays in sync.
export const CLI_VERSION = VERSION;
