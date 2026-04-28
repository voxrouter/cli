---
name: cli
description: >-
  VoxRouter's public `@voxrouter/cli` — the command-line surface customers (and their coding agents) use to operate VoxRouter. Distributed as a Bun-compiled native binary via curl|bash + Homebrew + winget + npm-as-binary-wrapper (Pattern C, same as Claude Code, OpenAI Codex CLI, agent-browser). Built for agentic consumption first, humans second: every dashboard action has a CLI equivalent so a coding agent can fully manage a customer's VoxRouter account without ever opening a browser. Covers the agentic thesis (CLI parity is leverage in the era where customers' agents do the work), the two-CLI split (`@voxrouter/cli` public, `@hal/cli` internal), the SDK-as-foundation architecture (CLI imports `@voxrouter/sdk@^1.0.0` from npm — dogfoods the same client customers use, no parallel HTTP layer), the auth model (`VOXROUTER_API_KEY` env var for data-plane; `voxrouter login` device-code OAuth for management), the command surface, the tag-driven release flow (push `vX.Y.Z`, GitHub Actions builds 6 binaries + publishes 7 npm packages), and the bundled-skills strategy (SKILL.md ships in the npm package and at `~/.voxrouter/SKILL.md` for non-npm installs so any coding agent can load it). Use when adding/editing CLI commands, deciding what belongs in the public CLI vs `@hal/cli`, planning auth flows, debugging customer CLI reports, or extending dashboard parity. Triggers on "voxrouter cli", "@voxrouter/cli", "voxrouter install", "voxrouter login", "voxrouter keys", "voxrouter speech", "voxrouter credits", "VOXROUTER_API_KEY", "dashboard parity", "agentic CLI".
---

# `@voxrouter/cli`

The official command-line tool for VoxRouter. Source at [github.com/voxrouter/cli](https://github.com/voxrouter/cli), ships as a native binary via `curl|bash` + Homebrew + winget + npm-as-binary-wrapper. Exposes a `voxrouter` binary.

## Why this exists — the agentic thesis

In a world where customers' coding agents do the integration work, **the CLI is the agent's hands**. A REST API works for a human writing curl commands; a CLI with predictable subcommands, `--json` output, and clear error codes works for an agent that has to chain operations together (create a key → set it as an env var → run a synthesis → check the credit balance).

Our thesis is that **dashboard parity in the CLI is leverage.** Every action a customer can perform in the web dashboard must have a CLI equivalent. If a coding agent can do everything from the terminal, the customer never has to context-switch to a browser, and VoxRouter becomes the path-of-least-resistance for any agent integrating real-time voice.

This is why `@voxrouter/cli` is the priority once the SDK has adoption signal — and why it is **scoped to public, customer-facing operations only.** Internal admin tooling lives elsewhere.

## Two-CLI architecture

| CLI | Audience | Distribution | Lives in |
|---|---|---|---|
| **`@voxrouter/cli`** | Customers + their coding agents | Native binary via curl\|bash + brew + winget + npm-as-binary-wrapper | [github.com/voxrouter/cli](https://github.com/voxrouter/cli) |
| **`@hal/cli`** | VoxRouter team only | Private (`"private": true`), workspace-only | `hal/cli/` (in [github.com/voxrouter/voxrouter](https://github.com/voxrouter/voxrouter)) |

If you find yourself adding a command that operates on infra (deploys, GPU allocation, provider key rotation, cross-customer admin operations) — that belongs in `hal`, not here. If you find yourself adding a command that operates on a single customer's account (their keys, their credits, their voices, their synthesis) — that belongs here.

There is no third "ops" CLI. Customer-facing = this; everything else = `hal`.

## SDK as foundation

The CLI imports `@voxrouter/sdk` as a **published npm dep** (`"@voxrouter/sdk": "^1.0.0"`) and goes through the SDK for every API call. There is no parallel HTTP client. This means:

- Every CLI command also dogfoods the SDK — bugs in the SDK surface in the CLI before they hit a customer.
- New endpoints land in the SDK first; the CLI is a thin wrapper. If a CLI command needs an endpoint the SDK doesn't expose, **extend the SDK**, don't bypass it.
- The CLI's behavior matches what a customer using the SDK directly will see — same errors, same auth, same rate limits.

This is the inverse of how some teams ship CLIs (Stripe, RunPod, Vapi all ship Go CLIs that are independent codepaths from their language SDKs). We made the opposite call deliberately because our customer audience is JS-native today and the SDK reuse is real leverage.

## Auth model

Two authenticators, distinct concerns:

| Token type | Stored in | Used for |
|---|---|---|
| `VOXROUTER_API_KEY` (`pk_...`) | env var | Data-plane: `speech`, `voices`, `providers`, `status`, `credits`, `activity` |
| Session token (post `voxrouter login`) | `~/.voxrouter/config.json` (`chmod 600`) | Management: `whoami`, `logout`, `keys list/create/delete` |

`voxrouter login` runs an RFC 8628 device-code OAuth flow against the API: the CLI prints a URL, the user opens it in a browser, approves the device, and the CLI's polling loop receives a 90-day session token. Mirrors `wrangler login` / `stripe login`.

The CLI auto-picks the right token per command based on the `authMode` declared in `lib/client.ts` — data-plane commands prefer `VOXROUTER_API_KEY`, management commands prefer the session token (with `pk_*` fallback for endpoints that accept either, like `whoami`).

CI-friendly variant of the management auth (a `sk_admin_...` style token issuable from the dashboard) may be added later — but the first-touch experience is `voxrouter login`. This is the most-expected pattern for a tool that mirrors a web dashboard.

## Command surface

Data plane (`VOXROUTER_API_KEY`):

```
voxrouter voices [--provider X] [--language en-US] [--gender female] [--json]
voxrouter speech "Hello world" --voice <id> --model <provider>/<modelId> [--format mp3|pcm] [--out file.mp3]
voxrouter providers [--json]
voxrouter status [--json]
voxrouter credits [--json]
voxrouter activity [--limit 50] [--json]
```

Management (`voxrouter login` session, written to `~/.voxrouter/config.json`):

```
voxrouter login [--timeout <seconds>]    # device-code OAuth → 90-day session
voxrouter logout                         # revoke session server-side + delete config
voxrouter whoami [--json]                # accepts pk_* fallback for who's-this-key probes

voxrouter keys list [--json]
voxrouter keys create <name> [--json]    # keyValue printed to stdout once
voxrouter keys delete <id> [--json]      # creator-scoped — only minter can revoke

voxrouter billing balance [--json]       # alias of `voxrouter credits` under the billing namespace
voxrouter billing methods [--json]       # saved Stripe payment methods (cards) for the org

voxrouter usage [--days 30] [--limit 100] [--by provider|error|recent] [--json]
```

Planned (not yet shipped):

```
voxrouter billing topup --amount 1000 --payment-method pm_...   # needs Stripe 3DS UX design
voxrouter org use <slug>                                        # blocked by issue #161 (org-first refactor)
```

All commands accept `--json` for machine-readable output (suitable for piping into `jq`). Errors exit non-zero with a single-line stderr message of the form `Error <status> <code> - <details>`. 401s on session-mode commands also print a `Hint: …voxrouter login…` line so the next step is obvious.

## Distribution: Pattern C (native binary, four channels)

The CLI ships as a Bun-compiled native binary, not a Node/JS bundle. We follow the same pattern as Claude Code, OpenAI Codex CLI, agent-browser, esbuild, swc, turbo, and biome — empirically the dominant pattern for 2025-2026 agent CLIs.

Four parallel channels deliver the same artifacts:

```bash
# 1. curl|bash (matches Cursor's cursor.com/install)
curl -fsSL https://voxrouter.ai/install | bash

# 2. PowerShell (Windows)
iwr -useb https://voxrouter.ai/install | iex

# 3. Homebrew tap
brew install voxrouter/tap/voxrouter

# 4. npm as binary wrapper (per-platform optionalDependencies)
npm install -g @voxrouter/cli
```

Build pipeline: `scripts/build.ts` runs `bun build --compile` for 6 platform targets (darwin-arm64, darwin-x64, linux-arm64, linux-x64, linux-x64-musl, windows-x64). Each binary bundles `@voxrouter/sdk` at compile time — the published artifacts have **zero runtime Node dependency**, including no `tsx`. The npm path uses 6 sibling packages (`@voxrouter/cli-<platform>`) declared as `optionalDependencies` of the meta `@voxrouter/cli`; npm picks exactly one based on the host's `os`/`cpu`/`libc`. The meta package's `bin.js` is a tiny Node shim that locates that one binary and execs it.

Self-update is built into the binary: `voxrouter update` checks the latest GitHub Release, verifies SHA256, and atomic-replaces `process.execPath`. The npm path refuses to self-update and points at `npm install -g @voxrouter/cli@latest` instead, since npm owns the binary's location there.

Releases are tag-driven. From a clean main: bump the version in `package.json`, commit, tag `v<version>`, push the tag. `.github/workflows/release.yml` takes over: builds 6 binaries, generates `manifest.json` with SHA256 hashes, attaches everything to a GitHub Release, publishes 7 npm packages.

## Bundled skills (this file ships everywhere)

`package.json#files` includes `SKILL.md`, so when a customer runs `npm install @voxrouter/cli`, this file lands in `node_modules/@voxrouter/cli/SKILL.md`. Customers' coding agents (Claude Code, Cursor, Codex) can load it to learn the CLI surface without re-fetching docs.

`install.sh` and `install.ps1` also drop a copy of `SKILL.md` at `~/.voxrouter/SKILL.md` so non-npm installs preserve agent discovery.

This is intentional — most npm packages ship a README for humans and stop there. We ship a SKILL.md alongside because **the agent is a first-class consumer of this package**, not an afterthought. As the CLI grows, per-workflow sub-skills (e.g. "use voxrouter to add TTS to a Next.js app") land under `skills/<name>/SKILL.md` and also ship.

The `README.md` is for humans browsing the npm page. The `SKILL.md` is for the agent the human delegated the work to. Edit both deliberately; they have different audiences.

## Architecture

```
voxrouter-cli (github.com/voxrouter/cli)
├── README.md          ← npm-page README, customer-facing
├── SKILL.md           ← THIS FILE, ships to npm, for customer agents
├── package.json       @voxrouter/cli meta, optionalDependencies → 6 platform pkgs
├── bin.js             Node shim: detect platform, exec @voxrouter/cli-<platform>/voxrouter
├── tsconfig.json      ES2022, strict, ESNext modules
├── install.sh         curl|bash installer (Mac/Linux), served at voxrouter.ai/install
├── install.ps1        PowerShell installer (Windows), served at voxrouter.ai/install (UA-dispatched)
├── homebrew/          Formula template + tap-repo setup notes
├── winget/            winget manifest YAMLs (3 files: version, locale, installer)
├── npm-platforms/     6 sibling npm packages, one per platform target
├── scripts/
│   └── build.ts       bun build --compile for 6 platform targets, generates manifest.json
└── src/
    ├── index.ts       commander setup, top-level error handler
    ├── lib/
    │   ├── client.ts  builds VoxRouter from env/config; AuthMode picker
    │   ├── config.ts  ~/.voxrouter/config.json read/write/clear (chmod 600)
    │   └── format.ts  table() + dollars() helpers, no extra deps
    └── commands/
        ├── login.ts          device-code OAuth → config
        ├── logout.ts         server revoke + clear config
        ├── whoami.ts         identity probe (pk_* or vr_session_*)
        ├── keys.ts           list / create / delete subcommands
        ├── voices.ts
        ├── speech.ts
        ├── providers.ts
        ├── status.ts
        ├── credits.ts
        └── activity.ts
```

Every command file follows the same pattern: a single exported function that takes the root commander `program`, registers a subcommand with options, and inside the handler reads `program.opts<GlobalCliOptions>()` for the global `--base-url` flag and instantiates an SDK client via `makeClient()`.

## Adding a new command

1. **If the endpoint isn't on the SDK yet**, add it to `@voxrouter/sdk` first (in the [voxrouter/voxrouter](https://github.com/voxrouter/voxrouter) monorepo). This usually means adding the schema to the OpenAPI spec, regenerating types, and adding a method to the `VoxRouter` class. Then publish a new SDK version and bump the CLI's `@voxrouter/sdk` dep.
2. Create `src/commands/<name>.ts` mirroring an existing command (the smallest is `status.ts`).
3. Register it in `src/index.ts`.
4. Add `--json` support; never skip it. Agents need machine-readable output.
5. Update the **Command surface** section of this file and `README.md`.
6. Run `pnpm typecheck` before committing.

Don't add deps lightly — the package is `commander` + `@voxrouter/sdk` only. Table formatting, color, prompts: all hand-rolled in `lib/format.ts` and friends. Every dep ships to every customer; keep the install fast.

## Publish flow

Tag-driven. From a clean `main`:

```bash
# Bump version, commit, tag, push.
npm version patch  # or minor / major
git push
git push --tags
```

`.github/workflows/release.yml` (triggered on `v*` tag) builds all 6 binaries via Bun, syncs the version across the meta + 6 platform packages and the CLI source, creates a GitHub Release with all assets + `manifest.json`, then publishes the 7 npm packages via `pnpm publish` (which rewrites `optionalDependencies` `workspace:*` to actual versions).

Required GitHub secret: `NPM_TOKEN` for npm publish auth. The token must have permission to publish under the `@voxrouter` scope.

## Boundary checks (what does NOT belong here)

- ❌ `voxrouter deploy` — that's `hal deploy`. The CLI never operates on infra.
- ❌ `voxrouter db query` — internal data, internal CLI.
- ❌ `voxrouter customer set-credits user@example.com 100` — admin operation across accounts, lives in `hal db wallet-set`.
- ❌ Anything that requires CF Access service-token auth or 1Password service-account credentials. Those are `hal` operations by definition.
- ✅ Anything a customer can do in the web dashboard.
- ✅ Anything a customer's coding agent would need to integrate VoxRouter into a project.

If you're not sure, the question to ask is: **"Could this command be useful to a customer who has only their `VOXROUTER_API_KEY` and a browser session for `voxrouter login`?"** If yes, it belongs here. If it needs more than that, it belongs in `hal`.

## Related repos

- **`@voxrouter/sdk`** ([voxrouter/voxrouter](https://github.com/voxrouter/voxrouter), `voxrouter/sdk/`) — The TS SDK the CLI wraps. New endpoints land here first; this repo bumps to a new published version after.
- **VoxRouter API gateway** ([voxrouter/voxrouter](https://github.com/voxrouter/voxrouter), `voxrouter/api/`) — Worker-side `/v1/*` handlers. New management endpoints (keys, billing, usage) land here.
- **`@hal/cli`** ([voxrouter/voxrouter](https://github.com/voxrouter/voxrouter), `hal/cli/`) — Internal admin CLI. Hard boundary: customer ops here, infra/admin in `hal`.
