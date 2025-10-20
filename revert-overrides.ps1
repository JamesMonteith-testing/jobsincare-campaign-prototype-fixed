# Restores .bak backups created by apply-overrides.ps1.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backs = Get-ChildItem -Path $root -Recurse -Filter '*.bak'
if (-not $backs) { Write-Host "No .bak backups found." -ForegroundColor Yellow; exit 0 }

$backs | ForEach-Object {
  $src = $_.FullName
  $dst = $src -replace '\.bak$',''
  Move-Item -Force $src $dst
  Write-Host "Restored $dst"
}
Write-Host "Revert complete." -ForegroundColor Green
