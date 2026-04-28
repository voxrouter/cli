#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function detectPlatform() {
  if (process.platform === "win32") return "windows-x64";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "darwin") return `darwin-${arch}`;
  if (process.platform === "linux") {
    // Best-effort musl detection: Alpine/musl users carry @voxrouter/cli-linux-x64-musl
    // via npm's per-platform optionalDependency selection. Fall through to glibc otherwise.
    try {
      require.resolve("@voxrouter/cli-linux-x64-musl/voxrouter");
      return "linux-x64-musl";
    } catch {}
    return `linux-${arch}`;
  }
  return null;
}

const platform = detectPlatform();
if (!platform) {
  process.stderr.write(
    `voxrouter: unsupported platform ${process.platform}/${process.arch}.\n` +
      `Supported: darwin-arm64, darwin-x64, linux-arm64, linux-x64, linux-x64-musl, windows-x64.\n`,
  );
  process.exit(1);
}

const binFile = platform === "windows-x64" ? "voxrouter.exe" : "voxrouter";
let binPath;
try {
  binPath = require.resolve(`@voxrouter/cli-${platform}/${binFile}`);
} catch {
  process.stderr.write(
    `voxrouter: failed to locate binary for platform ${platform}.\n` +
      `The matching @voxrouter/cli-${platform} optional dependency was not installed.\n` +
      `Try reinstalling: npm install --force @voxrouter/cli\n` +
      `Or use the standalone installer: curl -fsSL https://voxrouter.ai/install | bash\n`,
  );
  process.exit(1);
}

const result = spawnSync(binPath, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  process.stderr.write(`voxrouter: failed to spawn binary: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
