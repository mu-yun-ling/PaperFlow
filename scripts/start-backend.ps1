$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExecutable = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExecutable)) { throw 'Run scripts/setup.ps1 first.' }
Push-Location (Join-Path $projectRoot 'backend')
try {
    & $pythonExecutable -m flask --app app:create_app init-db
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
    & $pythonExecutable -m flask --app app:create_app run --host 127.0.0.1 --port 5000
    if ($LASTEXITCODE -ne 0) { throw 'Backend server stopped with an error.' }
} finally { Pop-Location }
