# Windows winget manifest for VoxRouter CLI

These three YAML files are the [winget manifest](https://github.com/microsoft/winget-pkgs) for `Voxrouter.Voxrouter`. They live in the monorepo as the source of truth; the published copies live in `microsoft/winget-pkgs` under `manifests/v/Voxrouter/Voxrouter/<version>/`.

## First-release setup (one time, manual)

Once the first GitHub Release is cut and the SHA256 from `manifest.json` is known:

1. Substitute placeholders in all three YAMLs:
   - `__VERSION__` → e.g. `0.2.0`
   - `__SHA256_WINDOWS_X64__` → `manifest.binaries["windows-x64"].sha256`
   - `__RELEASE_DATE__` → ISO date, e.g. `2026-04-28`
2. Validate with [wingetcreate](https://github.com/microsoft/winget-create):

   ```pwsh
   wingetcreate validate --manifest .
   ```

3. Submit to `microsoft/winget-pkgs`:

   ```pwsh
   wingetcreate submit --token $env:GITHUB_TOKEN --manifest .
   ```

After acceptance (~24-48h), users can install via:

```pwsh
winget install Voxrouter.Voxrouter
```

## Future: auto-submit on release

`.github/workflows/release-cli.yml` should grow a step that runs `wingetcreate update` on each release. Tracking under a follow-up once we cut the first release.
