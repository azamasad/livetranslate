@echo off
setlocal EnableExtensions
title Zeinab
call :RefreshPath

set "DESKTOP=%USERPROFILE%\Desktop"
for /f "tokens=1,2,*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop') do (
  if /i "%%A"=="Desktop" set "DESKTOP=%%C"
)
if not exist "%DESKTOP%" (
  echo Could not find the Desktop folder.
  pause
  exit /b 1
)
set "APP=%DESKTOP%\Zeinab"
if not exist "%APP%\package.json" (
  echo Zeinab is not installed yet. Open Install Zeinab first.
  pause
  exit /b 1
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo The Zeinab program files are missing. Open Install Zeinab again.
  pause
  exit /b 1
)

cd /d "%APP%"
if errorlevel 1 (
  echo Could not open the Zeinab folder.
  pause
  exit /b 1
)

echo.
echo Leave this window open while you listen.
echo Chrome will open the Zeinab page at http://127.0.0.1:5173
echo Start listening and Stop are on that page.
echo Close this window when you are finished.
echo.
set "CI=true"
call pnpm.cmd start
if errorlevel 1 (
  echo.
  echo Zeinab could not start. If another Zeinab window is already open, use that page.
  pause
)
exit /b 0

:RefreshPath
set "NODE_DIR=%ProgramFiles%\nodejs"
set "GIT_DIR=%ProgramFiles%\Git\cmd"
set "GIT_DIR86=%ProgramFiles(x86)%\Git\cmd"
set "NPM_DIR=%APPDATA%\npm"
set "MACHINE_PATH="
set "USER_PATH="
for /f "tokens=1,2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do (
  if /i "%%A"=="Path" set "MACHINE_PATH=%%C"
)
for /f "tokens=1,2,*" %%A in ('reg query "HKCU\Environment" /v Path') do (
  if /i "%%A"=="Path" set "USER_PATH=%%C"
)
set "PATH=%NODE_DIR%;%GIT_DIR%;%GIT_DIR86%;%NPM_DIR%;%MACHINE_PATH%;%USER_PATH%"
exit /b 0
