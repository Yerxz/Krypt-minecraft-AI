param(
    [string]$Message = "Update KRYPT"
)

$ErrorActionPreference = "Stop"

git add -A
if ($LASTEXITCODE -ne 0) { throw "Git add failed." }

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to sync." -ForegroundColor Yellow
    exit 0
}
if ($LASTEXITCODE -ne 1) { throw "Could not check staged changes." }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Git commit failed." }

git push
if ($LASTEXITCODE -ne 0) { throw "Git push failed." }

Write-Host "KRYPT synced to GitHub successfully." -ForegroundColor Green
