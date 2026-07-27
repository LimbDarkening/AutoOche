$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repositoryRoot 'backend'
$frontendPath = Join-Path $repositoryRoot 'frontend'
$pythonPath = Join-Path $backendPath '.venv\Scripts\python.exe'

if (-not (Test-Path $pythonPath)) {
    throw "Python environment not found at $pythonPath. Create it with: py -m venv backend/.venv"
}
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($pnpm) {
    $frontendCommand = "& '$($pnpm.Source)' dev"
} elseif ($npm) {
    $frontendCommand = "& '$($npm.Source)' run dev"
} else {
    throw 'Node.js is required to start the frontend. Install the current Node.js LTS release, then run npm install in the frontend folder.'
}

$apiCommand = "Set-Location -LiteralPath '$backendPath'; & '$pythonPath' -m uvicorn app.main:app --reload"
$webCommand = "Set-Location -LiteralPath '$frontendPath'; $frontendCommand"

Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand)
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $webCommand)

Write-Host 'Auto Oche is starting.'
Write-Host 'Open the frontend URL shown in the second PowerShell window (normally http://localhost:5173).'
