# Homebrew formula template for the VoxRouter CLI.
#
# This file lives in the monorepo for review and CI substitution. The
# published formula lives in a separate tap repo at:
#
#   https://github.com/voxrouter/homebrew-tap
#
# Users install with:  brew install voxrouter/tap/voxrouter
#
# How it gets updated on each release:
#   1. .github/workflows/release-cli.yml builds the 6 binaries.
#   2. CI substitutes __VERSION__ and __SHA256_*__ placeholders below.
#   3. CI opens a PR against voxrouter/homebrew-tap (or commits directly,
#      if the user grants the workflow a deploy key).
#
# Until the auto-PR step is wired up, the user manually copies this
# formula to the tap repo on the first release.

class Voxrouter < Formula
  desc "Official CLI for the VoxRouter TTS API"
  homepage "https://voxrouter.ai"
  version "__VERSION__"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/voxrouter/cli/releases/download/v#{version}/voxrouter-darwin-arm64"
      sha256 "__SHA256_DARWIN_ARM64__"
    end
    on_intel do
      url "https://github.com/voxrouter/cli/releases/download/v#{version}/voxrouter-darwin-x64"
      sha256 "__SHA256_DARWIN_X64__"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/voxrouter/cli/releases/download/v#{version}/voxrouter-linux-arm64"
      sha256 "__SHA256_LINUX_ARM64__"
    end
    on_intel do
      url "https://github.com/voxrouter/cli/releases/download/v#{version}/voxrouter-linux-x64"
      sha256 "__SHA256_LINUX_X64__"
    end
  end

  def install
    # The downloaded file is named e.g. "voxrouter-darwin-arm64"; rename to
    # "voxrouter" so it's invoked as `voxrouter` on PATH.
    binary_name = Dir["voxrouter-*"].first
    odie "Could not find voxrouter binary in download" if binary_name.nil?
    bin.install binary_name => "voxrouter"
    chmod 0755, bin/"voxrouter"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/voxrouter --version")
  end
end
