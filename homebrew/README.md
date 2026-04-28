# Homebrew tap for VoxRouter

The published Homebrew tap lives in a separate repo:
**https://github.com/voxrouter/homebrew-tap** (to be created on first release).

This directory holds the formula source-of-truth that the release workflow copies into the tap on each release.

## First-release setup (one time, manual)

The user creates the `voxrouter/homebrew-tap` GitHub repo:

```bash
gh repo create voxrouter/homebrew-tap --public --description "Homebrew tap for VoxRouter CLI"
git clone git@github.com:voxrouter/homebrew-tap.git
cd homebrew-tap
mkdir Formula
# Copy this formula in, fill the version + SHA256 placeholders from the release manifest
cp ../voxrouter/voxrouter/cli/homebrew/voxrouter.rb Formula/voxrouter.rb
git add Formula/voxrouter.rb
git commit -m "Initial: voxrouter CLI v0.X.Y"
git push
```

After that, users can run:

```bash
brew install voxrouter/tap/voxrouter
```

## Per-release update (manual until automated)

For each new release, fill the placeholders in `Formula/voxrouter.rb` from `manifest.json`:

- `__VERSION__` → `0.2.0`
- `__SHA256_DARWIN_ARM64__` → manifest.binaries["darwin-arm64"].sha256
- `__SHA256_DARWIN_X64__` → manifest.binaries["darwin-x64"].sha256
- `__SHA256_LINUX_ARM64__` → manifest.binaries["linux-arm64"].sha256
- `__SHA256_LINUX_X64__` → manifest.binaries["linux-x64"].sha256

## Future: auto-PR on release

`.github/workflows/release-cli.yml` should grow a step that opens a PR against `voxrouter/homebrew-tap` with the substituted formula. That requires either:

- A deploy key registered with the tap repo, or
- A GitHub App with `contents: write` on the tap.

Tracking under a follow-up issue once we cut the first release.
