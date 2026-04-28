#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ENTRY = resolve(REPO_ROOT, "src/index.ts");
const OUT_DIR = resolve(REPO_ROOT, "dist");

interface PlatformTarget {
  /** Bun --target value. */
  bunTarget: string;
  /** Distribution platform key (used in manifest, GitHub Releases asset name, npm sub-package). */
  platform: string;
  /** Output binary file name (with .exe on Windows). */
  binary: string;
}

const TARGETS: readonly PlatformTarget[] = [
  { bunTarget: "bun-darwin-arm64", platform: "darwin-arm64", binary: "voxrouter" },
  { bunTarget: "bun-darwin-x64", platform: "darwin-x64", binary: "voxrouter" },
  { bunTarget: "bun-linux-arm64", platform: "linux-arm64", binary: "voxrouter" },
  { bunTarget: "bun-linux-x64", platform: "linux-x64", binary: "voxrouter" },
  { bunTarget: "bun-linux-x64-musl", platform: "linux-x64-musl", binary: "voxrouter" },
  { bunTarget: "bun-windows-x64", platform: "windows-x64", binary: "voxrouter.exe" },
];

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!pkg.version) throw new Error("package.json is missing `version`.");
  return pkg.version;
}

function sha256(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function selectTargets(): readonly PlatformTarget[] {
  const filter = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!filter || filter === "all") return TARGETS;
  if (filter === "host") {
    const platform = process.platform === "win32" ? "windows-x64" : `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
    const t = TARGETS.find((x) => x.platform === platform);
    if (!t) throw new Error(`No target matches host platform ${platform}.`);
    return [t];
  }
  const t = TARGETS.find((x) => x.platform === filter || x.bunTarget === filter);
  if (!t) {
    throw new Error(
      `Unknown target "${filter}". Use "all", "host", or one of: ${TARGETS.map((x) => x.platform).join(", ")}.`,
    );
  }
  return [t];
}

function ensureSdkInstalled(): void {
  // @voxrouter/sdk is a published npm dependency (see package.json devDependencies).
  // pnpm install puts it in node_modules; Bun resolves it normally during compile.
  const sdkPath = resolve(REPO_ROOT, "node_modules/@voxrouter/sdk/dist/index.js");
  try {
    statSync(sdkPath);
    return;
  } catch {}
  console.log("Installing dependencies (node_modules/@voxrouter/sdk not found)…");
  const result = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("pnpm install failed.");
  }
}

function buildOne(target: PlatformTarget): { path: string; size: number; sha256: string } {
  const outPath = resolve(OUT_DIR, `voxrouter-${target.platform}${target.binary.endsWith(".exe") ? ".exe" : ""}`);
  console.log(`\n→ Building ${target.platform} (${target.bunTarget})`);
  const args = [
    "build",
    "--compile",
    `--target=${target.bunTarget}`,
    "--minify",
    "--sourcemap=none",
    ENTRY,
    "--outfile",
    outPath,
  ];
  const result = spawnSync("bun", args, { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`bun build failed for ${target.platform}`);
  }
  const size = statSync(outPath).size;
  const digest = sha256(outPath);
  console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB  sha256=${digest.slice(0, 12)}…`);
  return { path: outPath, size, sha256: digest };
}

function main(): void {
  const version = readVersion();
  const targets = selectTargets();
  console.log(`voxrouter CLI build — version ${version}, ${targets.length} target(s)`);

  ensureSdkInstalled();

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    binaries: {} as Record<string, { file: string; size: number; sha256: string }>,
  };

  for (const t of targets) {
    const out = buildOne(t);
    const fileName = `voxrouter-${t.platform}${t.binary.endsWith(".exe") ? ".exe" : ""}`;
    manifest.binaries[t.platform] = {
      file: fileName,
      size: out.size,
      sha256: out.sha256,
    };
  }

  const manifestPath = resolve(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nManifest written to ${manifestPath}`);
  console.log("Done.");
}

main();
