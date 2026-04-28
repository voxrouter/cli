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

// Distribution platform keys. bun --target and the output filename are both
// derived from these — there's no per-target configuration that would justify
// a struct.
const PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "linux-x64-musl",
  "windows-x64",
] as const;

type Platform = (typeof PLATFORMS)[number];

const bunTarget = (p: Platform) => `bun-${p}` as const;
const assetName = (p: Platform) =>
  `voxrouter-${p}${p === "windows-x64" ? ".exe" : ""}`;

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

function hostPlatform(): Platform {
  if (process.platform === "win32") return "windows-x64";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidate = `${process.platform}-${arch}`;
  if ((PLATFORMS as readonly string[]).includes(candidate)) return candidate as Platform;
  throw new Error(`No build target matches host platform ${candidate}.`);
}

function selectTargets(): readonly Platform[] {
  const filter = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!filter || filter === "all") return PLATFORMS;
  if (filter === "host") return [hostPlatform()];
  if ((PLATFORMS as readonly string[]).includes(filter)) return [filter as Platform];
  throw new Error(
    `Unknown target "${filter}". Use "all", "host", or one of: ${PLATFORMS.join(", ")}.`,
  );
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

function buildOne(
  platform: Platform,
  version: string,
): { file: string; size: number; sha256: string } {
  const file = assetName(platform);
  const outPath = resolve(OUT_DIR, file);
  console.log(`\n→ Building ${platform}`);
  const args = [
    "build",
    "--compile",
    `--target=${bunTarget(platform)}`,
    "--minify",
    "--sourcemap=none",
    `--define=__VERSION__="${version}"`,
    ENTRY,
    "--outfile",
    outPath,
  ];
  const result = spawnSync("bun", args, { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`bun build failed for ${platform}`);
  }
  const size = statSync(outPath).size;
  const digest = sha256(outPath);
  console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB  sha256=${digest.slice(0, 12)}…`);
  return { file, size, sha256: digest };
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

  for (const platform of targets) {
    manifest.binaries[platform] = buildOne(platform, version);
  }

  const manifestPath = resolve(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nManifest written to ${manifestPath}`);
  console.log("Done.");
}

main();
