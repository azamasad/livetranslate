@echo off
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%AppData%\npm;%PATH%"
where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm was not found. Run the one-time setup in PowerShell first.
  pause
  exit /b 1
)
echo Leave the Zeinab window open while you listen.
start "Zeinab" cmd /k pnpm start
powershell -NoProfile -Command "$ok = $false; foreach ($try in 1..40) { if (-not $ok) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/ -TimeoutSec 2 | Out-Null; $ok = $true } catch { Start-Sleep -Seconds 1 } } }; if ($ok) { Start-Process 'http://127.0.0.1:5173/?pair=en-fa' } else { Write-Host 'Open Chrome to http://127.0.0.1:5173/?pair=en-fa' }"
