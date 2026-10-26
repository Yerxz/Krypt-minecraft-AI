$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VoiceRoot = Join-Path $ProjectRoot 'voice'
$Bridge = Join-Path $VoiceRoot 'mineflayer-simple-voice-chat'

Write-Host 'KRYPT Simple Voice Chat bridge setup' -ForegroundColor Cyan
Write-Host 'This installs a community Mineflayer bridge. It is not an official Simple Voice Chat project.' -ForegroundColor Yellow
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required. Install Git for Windows from https://git-scm.com/download/win, reopen PowerShell, then run this script again.'
}
if (-not (Test-Path $Bridge)) {
  git clone https://github.com/forester302/mineflayer-simple-voice-chat.git $Bridge
  if ($LASTEXITCODE -ne 0) { throw 'Could not clone the voice bridge. Check your internet connection and GitHub access.' }
} else {
  Write-Host 'Bridge folder already exists; leaving it unchanged.'
}
Push-Location $Bridge
try {
  npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed inside the voice bridge folder.' }
  npm.cmd exec --yes --package=typescript -- tsc --skipLibCheck
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript compilation failed. See the output above.' }
} finally { Pop-Location }
Write-Host ''
Write-Host 'Bridge setup finished. Next: install/verify Ollama, then configure Piper for the best JARVIS-style voice.' -ForegroundColor Green
Write-Host 'If KRYPT does not announce voice-player initialization, the bridge may not support your server/plugin version; check the server UDP port and client voice-chat status.' -ForegroundColor Yellow
