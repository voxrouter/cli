# @voxrouter/cli

Official CLI for the [VoxRouter](https://voxrouter.ai) TTS API. Thin wrapper
around `@voxrouter/sdk` — every command is one HTTP call plus pretty-printing.

## Install

The CLI ships as a single native binary (no Node required) via four parallel channels:

```bash
# macOS / Linux
curl -fsSL https://voxrouter.ai/install | bash

# Windows (PowerShell)
iwr -useb https://voxrouter.ai/install | iex

# Homebrew
brew install voxrouter/tap/voxrouter

# npm — pin in your package.json next to @voxrouter/sdk
npm install -g @voxrouter/cli
# or one-off without installing:
npx @voxrouter/cli voices
```

The npm path uses [per-platform `optionalDependencies`](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#optionaldependencies) — npm only installs the binary that matches your `os`/`cpu`/`libc`. Same pattern as `esbuild`, `swc`, `turbo`, `biome`, and `@anthropic-ai/claude-code`.

### Update

```bash
voxrouter update            # check + install latest
voxrouter update --check    # check only
voxrouter update --to 0.2.1 # pin a specific version
```

If you installed via npm, run `npm install -g @voxrouter/cli@latest` instead — `voxrouter update` is for the standalone binary path.

### Pin a specific version

The bash installer respects `VOXROUTER_VERSION`:

```bash
curl -fsSL https://voxrouter.ai/install | VOXROUTER_VERSION=0.2.0 bash
```

The npm path pins via `package.json` as you'd expect.

## Auth

Two paths depending on what you're doing.

**Data-plane** (synthesizing speech, listing voices, checking credits) uses
your API key:

```bash
export VOXROUTER_API_KEY=pk_...
```

**Management** (creating API keys, viewing your account) uses a CLI session
authorized via your browser:

```bash
voxrouter login
# Open the URL printed in your terminal, approve, return to your terminal.
# A 90-day session token is saved to ~/.voxrouter/config.json (chmod 600).

voxrouter whoami     # confirm who you're authenticated as
voxrouter logout     # revoke the session and delete the local config
```

To target a non-prod environment, override the API base URL with either a
flag or env var:

```bash
voxrouter --base-url https://api.dev.voxrouter.ai voices
# or
export VOXROUTER_BASE_URL=https://api.dev.voxrouter.ai
voxrouter voices
```

## Commands

### Data plane (uses `VOXROUTER_API_KEY`)

```bash
voxrouter voices [--provider X] [--language en-US] [--gender female] [--json]
voxrouter speech "Hello world" --voice <id> --model <provider>/<modelId> [--format mp3|pcm] [--out file.mp3]
voxrouter providers [--json]
voxrouter status [--json]
voxrouter credits [--json]
voxrouter activity [--limit 50] [--json]
```

When `--out` is omitted, `speech` writes raw audio bytes to stdout — pipe
into a player or file:

```bash
voxrouter speech "Hello" --voice EXAVITQu4vr4xnSDxMaL --model elevenlabs/eleven_turbo_v2_5 --out hello.mp3
voxrouter speech "Hello" --voice EXAVITQu4vr4xnSDxMaL --model elevenlabs/eleven_turbo_v2_5 > hello.mp3
```

### Account / keys (uses `voxrouter login` session)

```bash
voxrouter login [--timeout <seconds>]    # device-code OAuth → 90-day session
voxrouter logout                         # revoke + clear local config
voxrouter whoami [--json]                # show current identity

voxrouter keys list [--json]
voxrouter keys create <name>             # full key value printed to stdout once
voxrouter keys delete <id>               # creator-scoped — only minter can revoke
```

`voxrouter keys create` prints the secret key value to **stdout** and
metadata/instructions to stderr, so you can pipe the secret straight into
a file:

```bash
voxrouter keys create ci-runner > ci.key
chmod 600 ci.key
```

All commands accept `--json` for machine-readable output (suitable for
piping into `jq`).

### Provider-specific options

`voxrouter speech` accepts `--provider-options <json>` for passthrough
options the upstream provider supports but VoxRouter doesn't expose as
typed flags. Shape depends on the provider; consult the provider adapter
docs.

```bash
voxrouter speech "Hello" \
  --voice EXAVITQu4vr4xnSDxMaL \
  --model elevenlabs/eleven_turbo_v2_5 \
  --provider-options '{"stability":0.65,"similarity_boost":0.8}' \
  --out hello.mp3
```

The argument must be a JSON object. Arrays, primitives, and malformed
JSON exit `2` (usage error) before any network call.

## Exit codes

Customer scripts can rely on this contract:

| Code | Meaning |
|------|---------|
| `0` | Success. |
| `1` | Runtime error — the network call failed, the server returned an error, or something unexpected went wrong mid-execution. Safe to retry the exact same invocation. |
| `2` | Usage error — invalid flag, missing required argument, malformed input, or missing required env config (e.g. `VOXROUTER_API_KEY`). Do **not** retry without fixing the invocation. |
| `130` | Interrupted by SIGINT (Ctrl-C). Standard POSIX convention. |

The contract is enforced at the type level: the SDK exits with one of
these codes deterministically — there's no "default 1" path.
