# VoxRouter CLI installer for Windows.
#
# Usage:  iwr -useb https://voxrouter.ai/install | iex
#
# Optional environment variables:
#   $env:VOXROUTER_VERSION       Pin a specific release. Defaults to "latest".
#   $env:VOXROUTER_INSTALL_DIR   Override install location. Defaults to %USERPROFILE%\.voxrouter\bin.
#   $env:VOXROUTER_SKIP_PATH     Set to "1" to skip PATH editing.

$ErrorActionPreference = "Stop"

$Repo = "voxrouter/cli"
$DefaultInstallDir = Join-Path $env:USERPROFILE ".voxrouter\bin"
$DefaultSkillDir  = Join-Path $env:USERPROFILE ".voxrouter"

$Version = if ($env:VOXROUTER_VERSION) { $env:VOXROUTER_VERSION } else { "latest" }
$InstallDir = if ($env:VOXROUTER_INSTALL_DIR) { $env:VOXROUTER_INSTALL_DIR } else { $DefaultInstallDir }
$SkipPath = ($env:VOXROUTER_SKIP_PATH -eq "1")

function Write-Info($msg) { Write-Host "voxrouter: $msg" }
function Write-Ok($msg)   { Write-Host "[ok] $msg"   -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[fail] $msg" -ForegroundColor Red; exit 1 }

function Get-Platform {
    $arch = (Get-CimInstance -ClassName Win32_Processor).Architecture
    # Architecture: 9 = x64, 12 = ARM64. Fall back to PROCESSOR_ARCHITECTURE for safety.
    if ($arch -eq 9 -or $env:PROCESSOR_ARCHITECTURE -eq "AMD64") {
        return "windows-x64"
    }
    Write-Fail "Unsupported architecture (PROCESSOR_ARCHITECTURE=$env:PROCESSOR_ARCHITECTURE). Only windows-x64 is currently published."
}

function Resolve-ReleaseTag($version) {
    if ($version -eq "latest") {
        # Follow the redirect on /releases/latest to get the actual tag.
        $resp = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" `
                                  -MaximumRedirection 0 `
                                  -ErrorAction SilentlyContinue
        $location = if ($resp.Headers.Location) { $resp.Headers.Location } else { (Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" -UseBasicParsing).BaseResponse.ResponseUri.AbsoluteUri }
        if ($location -match "/tag/(v[0-9][^/]+)$") {
            return $Matches[1]
        }
        Write-Fail "Could not resolve latest release tag from github.com/$Repo. Set `$env:VOXROUTER_VERSION explicitly."
    }
    $clean = $version.TrimStart("v")
    return "v$clean"
}

function Get-FileSha256($path) {
    return (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
}

function Add-ToUserPath($dir) {
    if ($SkipPath) { return }
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -and $userPath.Split(";") -contains $dir) { return }
    $newPath = if ([string]::IsNullOrEmpty($userPath)) { $dir } else { "$userPath;$dir" }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = "$env:Path;$dir"
}

function Main {
    $platform = Get-Platform
    $tag = Resolve-ReleaseTag $Version
    $version = $tag -replace "^v", ""

    Write-Info "Installing voxrouter $version for $platform"

    $assetUrl    = "https://github.com/$Repo/releases/download/$tag/voxrouter-$platform.exe"
    $manifestUrl = "https://github.com/$Repo/releases/download/$tag/manifest.json"
    $skillUrl    = "https://raw.githubusercontent.com/$Repo/$tag/SKILL.md"

    $tmpDir = Join-Path $env:TEMP ("voxrouter-install-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmpDir | Out-Null

    try {
        Write-Info "Downloading manifest"
        $manifestPath = Join-Path $tmpDir "manifest.json"
        Invoke-WebRequest -Uri $manifestUrl -OutFile $manifestPath -UseBasicParsing

        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $expectedSha = $manifest.binaries.$platform.sha256
        if (-not $expectedSha) {
            Write-Fail "manifest.json has no entry for platform $platform"
        }

        Write-Info "Downloading binary ($assetUrl)"
        $binaryTmp = Join-Path $tmpDir "voxrouter.exe"
        Invoke-WebRequest -Uri $assetUrl -OutFile $binaryTmp -UseBasicParsing

        Write-Info "Verifying SHA256"
        $actualSha = Get-FileSha256 $binaryTmp
        if ($actualSha -ne $expectedSha.ToLower()) {
            Write-Fail "SHA256 mismatch: expected $expectedSha, got $actualSha"
        }

        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        $binaryPath = Join-Path $InstallDir "voxrouter.exe"
        Copy-Item -Path $binaryTmp -Destination $binaryPath -Force

        # Drop SKILL.md alongside the binary for agent-tooling discovery.
        try {
            Invoke-WebRequest -Uri $skillUrl `
                              -OutFile (Join-Path $DefaultSkillDir "SKILL.md") `
                              -UseBasicParsing -ErrorAction SilentlyContinue
        } catch { }

        Add-ToUserPath $InstallDir

        Write-Ok "Installed $binaryPath"
        if (-not $SkipPath) {
            Write-Info "Added $InstallDir to your user PATH. Open a new terminal or run: `$env:Path += `";$InstallDir`""
        } else {
            Write-Info "Skipped PATH editing. Add $InstallDir to your PATH manually."
        }
    } finally {
        Remove-Item -Recurse -Force -Path $tmpDir -ErrorAction SilentlyContinue
    }
}

Main
