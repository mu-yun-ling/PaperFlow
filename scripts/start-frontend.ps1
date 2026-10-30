$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectRoot 'frontend')
try {
    & npm.cmd run dev -- --open
    if ($LASTEXITCODE -ne 0) { throw 'Frontend server stopped with an error.' }
} finally { Pop-Location }
