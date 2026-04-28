# Per-platform npm packages

These six packages each ship one Bun-compiled `voxrouter` binary for one platform. They're not installed directly — they're declared as `optionalDependencies` of the meta `@voxrouter/cli` package, and npm picks the matching one based on the host's `os`/`cpu`/`libc`.

This mirrors the pattern used by `esbuild`, `swc`, `turbo`, `biome`, and `@anthropic-ai/claude-code`.

## How releases populate these

The Bun-compiled binary lands here at release time only — `voxrouter/cli/scripts/build.ts` writes binaries to `voxrouter/cli/dist/`, and the release CI workflow copies each one into the matching `npm-platforms/<platform>/` directory before running `pnpm publish` per package.

The binary file is intentionally not committed to git. CI fills it in at publish time.

## Why not symlink or hard-link?

npm publishes whatever is on disk, not whatever symlinks point to. A symlink would break for end-users. CI must copy the binary, not link it.
