$ErrorActionPreference = 'Stop'
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host 'Ollama is not installed or is not on PATH.' -ForegroundColor Yellow
  Write-Host 'Install it from https://ollama.com/download/windows, launch Ollama, reopen PowerShell, then run this script again.'
  exit 1
}
Write-Host 'Pulling the configured local model qwen2.5:3b (free, runs locally)...' -ForegroundColor Cyan
ollama pull qwen2.5:3b
if ($LASTEXITCODE -ne 0) { throw 'Could not download qwen2.5:3b. Check your internet connection and available disk space.' }
try {
  $response = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
  Write-Host 'Ollama local API is responding.' -ForegroundColor Green
} catch {
  Write-Host 'Model pulled, but the Ollama API did not respond. Launch Ollama from the Start menu and run this script again.' -ForegroundColor Yellow
  exit 1
}
Write-Host 'Local AI setup complete. KRYPT is configured to use qwen2.5:3b at http://127.0.0.1:11434.' -ForegroundColor Green
