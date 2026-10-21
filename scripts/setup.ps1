param([string]$PythonExecutable = 'python')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $venvPython)) {
        & $PythonExecutable -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ required. Pass -PythonExecutable with a valid python.exe path.' }
        & $PythonExecutable -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the virtual environment.' }
    }
    & $venvPython -m pip install -r backend/requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    Push-Location frontend
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    } finally { Pop-Location }
    Push-Location backend
    try {
        & $venvPython -m flask --app app:create_app init-db
        if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
    } finally { Pop-Location }
    Write-Host 'PaperFlow is ready. Run start-backend.ps1 and start-frontend.ps1 in separate terminals.'
} finally { Pop-Location }
