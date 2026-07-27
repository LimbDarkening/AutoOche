.PHONY: dev test build

# Starts the API and the React app in separate PowerShell windows.
dev:
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1

test:
	powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location backend; & .\.venv\Scripts\python.exe -m pytest -q"

build:
	powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location frontend; if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm run build } else { npm run build }"
