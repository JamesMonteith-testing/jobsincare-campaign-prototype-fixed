# Applies files from .\overrides\* into the repo, backing up originals to .bak once.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ovr  = Join-Path $root 'overrides'

if (-not (Test-Path $ovr)) { Write-Host "No overrides folder found." -ForegroundColor Yellow; exit 1 }

$changed = @()
Get-ChildItem -Path $ovr -Recurse | ForEach-Object {
  if (-not $_.PSIsContainer) {
    $rel = $_.FullName.Substring($ovr.Length).TrimStart('\','/')
    $dst = Join-Path $root $rel
    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }
    # Backup once
    if ((Test-Path $dst) -and -not (Test-Path ($dst + '.bak'))) {
      Copy-Item $dst ($dst + '.bak')
    }
    Copy-Item $_.FullName $dst -Force
    $changed += $rel
  }
}

if ($changed.Count -eq 0) { Write-Host "No files to apply." -ForegroundColor Yellow; exit 0 }
Write-Host "Applied overrides for:" -ForegroundColor Green
$changed | ForEach-Object { Write-Host "  $_" }
