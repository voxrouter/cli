#!/usr/bin/env bash
# VoxRouter CLI installer for macOS and Linux.
#
# Usage:  curl -fsSL https://voxrouter.ai/install | bash
#
# Optional environment variables:
#   VOXROUTER_VERSION   Pin a specific release (e.g. "0.2.0"). Defaults to "latest".
#   VOXROUTER_INSTALL_DIR  Override install location. Defaults to $HOME/.voxrouter/bin.
#   VOXROUTER_SKIP_PATH    Set to "1" to skip PATH editing.

set -euo pipefail

readonly REPO="voxrouter/cli"
readonly DEFAULT_INSTALL_DIR="${HOME}/.voxrouter/bin"
readonly DEFAULT_SKILL_DIR="${HOME}/.voxrouter"

VERSION="${VOXROUTER_VERSION:-latest}"
INSTALL_DIR="${VOXROUTER_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
SKIP_PATH="${VOXROUTER_SKIP_PATH:-0}"

# ---------------------------------------------------------------------------
# Pretty output
# ---------------------------------------------------------------------------

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  GREEN=$'\033[0;32m'
  RED=$'\033[0;31m'
  RESET=$'\033[0m'
else
  BOLD=""
  GREEN=""
  RED=""
  RESET=""
fi

info() { echo "${BOLD}voxrouter:${RESET} $*"; }
ok()   { echo "${GREEN}✓${RESET} $*"; }
fail() { echo "${RED}✗${RESET} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux"  ;;
    *) fail "Unsupported OS: $(uname -s). VoxRouter CLI supports macOS and Linux via this script; use install.ps1 for Windows." ;;
  esac

  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64"   ;;
    *) fail "Unsupported architecture: $(uname -m). Supported: arm64, x64." ;;
  esac

  # On Linux x64, prefer the musl build when running under Alpine/musl libc.
  if [[ "$os" == "linux" && "$arch" == "x64" ]]; then
    if ldd --version 2>&1 | grep -q -i musl; then
      echo "linux-x64-musl"
      return
    fi
  fi

  echo "${os}-${arch}"
}

# ---------------------------------------------------------------------------
# Release URL resolution
# ---------------------------------------------------------------------------

resolve_release_tag() {
  local version="$1"
  if [[ "$version" == "latest" ]]; then
    # GitHub redirects /releases/latest to the actual tag; use the redirect target.
    local tag
    tag="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" \
      | sed -n 's#.*/tag/\(v[0-9][^/]*\)$#\1#p')"
    if [[ -z "$tag" ]]; then
      fail "Could not resolve latest release tag from github.com/${REPO}. Try setting VOXROUTER_VERSION explicitly."
    fi
    echo "$tag"
  else
    echo "v${version#v}"
  fi
}

# ---------------------------------------------------------------------------
# Download + verify
# ---------------------------------------------------------------------------

download() {
  local url="$1" out="$2"
  if ! curl -fsSL --retry 3 --retry-delay 1 "$url" -o "$out"; then
    fail "Download failed: $url"
  fi
}

verify_sha256() {
  local file="$1" expected="$2"
  local actual
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  else
    fail "Neither shasum nor sha256sum is installed. Cannot verify download integrity."
  fi
  if [[ "$actual" != "$expected" ]]; then
    fail "SHA256 mismatch for $(basename "$file"): expected $expected, got $actual"
  fi
}

# ---------------------------------------------------------------------------
# PATH wiring
# ---------------------------------------------------------------------------

shell_rc_files() {
  local files=()
  [[ -f "${HOME}/.bashrc"  ]] && files+=("${HOME}/.bashrc")
  [[ -f "${HOME}/.zshrc"   ]] && files+=("${HOME}/.zshrc")
  [[ -f "${HOME}/.profile" ]] && files+=("${HOME}/.profile")
  printf '%s\n' "${files[@]}"
}

ensure_on_path() {
  local dir="$1"
  case ":${PATH}:" in
    *:"${dir}":*) return 0 ;;
  esac
  if [[ "$SKIP_PATH" == "1" ]]; then
    return 0
  fi
  local marker='# Added by VoxRouter CLI installer'
  local line="export PATH=\"${dir}:\$PATH\""
  while IFS= read -r rc; do
    if grep -qF "$marker" "$rc" 2>/dev/null; then
      continue
    fi
    {
      echo ""
      echo "$marker"
      echo "$line"
    } >> "$rc"
  done < <(shell_rc_files)
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  local platform tag version asset_url binary_path tmp_dir
  platform="$(detect_platform)"
  tag="$(resolve_release_tag "$VERSION")"
  version="${tag#v}"

  info "Installing voxrouter ${version} for ${platform}"

  asset_url="https://github.com/${REPO}/releases/download/${tag}/voxrouter-${platform}"
  manifest_url="https://github.com/${REPO}/releases/download/${tag}/manifest.json"

  tmp_dir="$(mktemp -d -t voxrouter-install.XXXXXX)"
  trap "rm -rf '${tmp_dir}'" EXIT

  info "Downloading manifest"
  download "$manifest_url" "${tmp_dir}/manifest.json"

  local expected_sha256
  # Inline JSON parse (avoid jq dep): grab "sha256":"..." for the matching platform key.
  expected_sha256="$(
    awk -v p="\"${platform}\"" '
      $0 ~ p {found=1}
      found && /"sha256"/ {
        match($0, /"sha256"[ ]*:[ ]*"([0-9a-f]+)"/, m)
        if (m[1]) { print m[1]; exit }
      }
    ' "${tmp_dir}/manifest.json"
  )"
  if [[ -z "$expected_sha256" ]]; then
    fail "manifest.json has no entry for platform ${platform}"
  fi

  info "Downloading binary (${asset_url})"
  download "$asset_url" "${tmp_dir}/voxrouter"

  info "Verifying SHA256"
  verify_sha256 "${tmp_dir}/voxrouter" "$expected_sha256"

  mkdir -p "${INSTALL_DIR}"
  binary_path="${INSTALL_DIR}/voxrouter"
  install -m 0755 "${tmp_dir}/voxrouter" "${binary_path}"

  # Drop SKILL.md alongside the binary for agent-tooling discovery on
  # non-npm installs. Best-effort: skip silently if the asset is missing.
  if curl -fsSL "https://raw.githubusercontent.com/${REPO}/${tag}/SKILL.md" \
       -o "${DEFAULT_SKILL_DIR}/SKILL.md" 2>/dev/null; then
    :
  fi

  ensure_on_path "${INSTALL_DIR}"

  ok "Installed ${binary_path}"
  if [[ "$SKIP_PATH" != "1" ]]; then
    case ":${PATH}:" in
      *:"${INSTALL_DIR}":*)
        info "Run \`voxrouter --help\` to get started."
        ;;
      *)
        info "Added ${INSTALL_DIR} to your shell PATH (${BOLD}restart your shell${RESET} or run: export PATH=\"${INSTALL_DIR}:\$PATH\")"
        ;;
    esac
  else
    info "Skipped PATH editing. Add ${INSTALL_DIR} to your PATH manually."
  fi
}

main "$@"
