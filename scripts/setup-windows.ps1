# One-time setup for Zeinab on Windows. Paste this whole file into PowerShell.
$ErrorActionPreference = "Stop"
$desktop = [Environment]::GetFolderPath("Desktop")
$dest = Join-Path $desktop "Zeinab"
$branch = "cursor/zeinab-6909"
$repo = "https://github.com/azamasad/livetranslate.git"

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $extra = @(
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Git\cmd",
    "${env:ProgramFiles(x86)}\Git\cmd",
    "$env:APPDATA\npm"
  ) -join ";"
  $env:Path = "$extra;$machine;$user"
}

function Stop-IfFailed($step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed."
  }
}

Refresh-Path
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
$hasNode = [bool](Get-Command node -ErrorAction SilentlyContinue)
if ((-not $hasGit -or -not $hasNode) -and -not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw "winget is missing. Install App Installer from the Microsoft Store, then paste this again."
}
if (-not $hasGit) {
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git installed, but this window cannot see it yet. Close PowerShell, open it again, and paste the command once more."
  }
}
if (-not $hasNode) {
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node installed, but this window cannot see it yet. Close PowerShell, open it again, and paste the command once more."
  }
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "Node is installed, but this window cannot see npm.cmd yet. Close PowerShell, open it again, and paste the command once more."
}
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  & npm.cmd install -g pnpm@10.33.4
  Stop-IfFailed "Installing pnpm"
  Refresh-Path
}
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  throw "pnpm.cmd is not on PATH yet. Close PowerShell, open it again, and paste the command once more."
}

$gitDir = Join-Path $dest ".git"
if (Test-Path $gitDir) {
  git -C $dest fetch origin $branch
  Stop-IfFailed "Fetching $branch"
  git -C $dest checkout -B $branch "origin/$branch"
  Stop-IfFailed "Updating $branch"
} elseif (Test-Path $dest) {
  $existing = @(Get-ChildItem -Force $dest)
  if ($existing.Count -gt 0) {
    throw "Desktop\Zeinab already has other files. Rename that folder, then paste this again."
  }
  git clone --branch $branch $repo $dest
  Stop-IfFailed "Cloning $repo"
} else {
  git clone --branch $branch $repo $dest
  Stop-IfFailed "Cloning $repo"
}

git -C $dest config core.longpaths true
Set-Location $dest
$env:CI = "true"
& pnpm.cmd install
Stop-IfFailed "pnpm install"
Write-Host "Next time, from this folder: pnpm.cmd start"
& pnpm.cmd start
