# Forklift GUI installer for Windows (PowerShell).
#
#   irm https://raw.githubusercontent.com/r4nd0mth1ngs/forklift_ui/main/install.ps1 | iex
#
# Runs the app's setup silently (a per-user install — no admin prompt), then adds
# the install directory to your user PATH so `forklift-gui` works from a terminal.
# The setup also creates the usual Start Menu / Desktop shortcuts.
#
# Environment overrides:
#   FORKLIFT_GUI_VERSION   install a specific tag, e.g. v0.1.4 (default: latest release)
#   FORKLIFT_GUI_REPO      GitHub repo slug          (default: r4nd0mth1ngs/forklift_ui)

$ErrorActionPreference = "Stop"

$Repo = if ($env:FORKLIFT_GUI_REPO) { $env:FORKLIFT_GUI_REPO } else { "r4nd0mth1ngs/forklift_ui" }
$Version = if ($env:FORKLIFT_GUI_VERSION) { $env:FORKLIFT_GUI_VERSION } else { "latest" }

if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") {
    throw "no Windows ARM build yet - install from a native x64 shell, or build from source"
}

# Resolve the numeric version (the setup filename embeds it, e.g. ..._0.1.4_x64-setup.exe).
if ($Version -eq "latest") {
    $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Tag = $rel.tag_name
} else {
    $Tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
}
$Num = $Tag.TrimStart("v")

$Base = "https://github.com/$Repo/releases/download/$Tag"
$Asset = "forklift-gui_${Num}_x64-setup.exe"

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
New-Item -ItemType Directory $Tmp | Out-Null
try {
    $Setup = Join-Path $Tmp $Asset
    Write-Host "downloading $Base/$Asset"
    Invoke-WebRequest "$Base/$Asset" -OutFile $Setup -UseBasicParsing

    # Best effort: verify against checksums.txt if the release ships one. Only the
    # fetch is in the catch — a missing checksums.txt 404s (WebException on Windows
    # PowerShell, HttpResponseException on pwsh 7), and either way we just skip. A
    # genuine checksum MISMATCH throws below, outside the catch, so it still aborts.
    $sums = $null
    try {
        $sums = (Invoke-WebRequest "$Base/checksums.txt" -UseBasicParsing).Content -split "`n"
    } catch {
        # No checksums.txt in this release — skip verification.
    }
    if ($sums) {
        $line = $sums | Where-Object { $_ -match [regex]::Escape($Asset) }
        if ($line) {
            $expected = ($line -split '\s+')[0]
            $actual = (Get-FileHash $Setup -Algorithm SHA256).Hash.ToLower()
            if ($expected -ne $actual) { throw "checksum verification FAILED for $Asset - refusing to install" }
            Write-Host "  checksum ok"
        }
    }

    Write-Host "running the installer (silent, per-user)..."
    Start-Process -FilePath $Setup -ArgumentList "/S" -Wait

    # tauri's NSIS setup installs per-user to %LOCALAPPDATA%\forklift-gui. Check that
    # first, then fall back to a bounded search of LOCALAPPDATA — never Program Files,
    # where a per-user install can't land.
    $InstallDir = Join-Path $env:LOCALAPPDATA "forklift-gui"
    $exe = Join-Path $InstallDir "forklift-gui.exe"
    if (-not (Test-Path $exe)) {
        $found = Get-ChildItem -Path $env:LOCALAPPDATA -Filter "forklift-gui.exe" `
                     -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $exe = $found.FullName; $InstallDir = Split-Path $exe } else { $exe = $null }
    }

    if ($exe) {
        Write-Host "installed $exe"
        $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ([string]::IsNullOrEmpty($UserPath)) {
            [Environment]::SetEnvironmentVariable("Path", $InstallDir, "User")
            Write-Host "added $InstallDir to your user PATH (restart your terminal, then run 'forklift-gui')"
        } elseif ($UserPath -notlike "*$InstallDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
            Write-Host "added $InstallDir to your user PATH (restart your terminal, then run 'forklift-gui')"
        } else {
            Write-Host "run 'forklift-gui' to launch"
        }
    } else {
        Write-Host "installed — launch 'Forklift GUI' from the Start Menu"
    }
} finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
