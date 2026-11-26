@echo off
setlocal EnableExtensions
title Install Zeinab
echo.
echo Installing Zeinab. Leave this window open until it says Zeinab is installed.
echo The first time needs an internet connection.
echo.

call :RefreshPath

where git >nul 2>&1 && set "HAS_GIT=1" || set "HAS_GIT=0"
where node >nul 2>&1 && set "HAS_NODE=1" || set "HAS_NODE=0"
if "%HAS_GIT%"=="0" set "NEED_WINGET=1"
if "%HAS_NODE%"=="0" set "NEED_WINGET=1"
if "%NEED_WINGET%"=="1" (
  where winget >nul 2>&1
  if errorlevel 1 (
    echo winget is missing. Install App Installer from the Microsoft Store, then open this file again.
    pause
    exit /b 1
  )
)

if "%HAS_GIT%"=="0" (
  echo Installing Git...
  winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
  call :RefreshPath
  where git >nul 2>&1
  if errorlevel 1 (
    echo Git was installed, but this window cannot see it yet. Close this window and open Install Zeinab again.
    pause
    exit /b 1
  )
)

if "%HAS_NODE%"=="0" (
  echo Installing Node...
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  call :RefreshPath
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node was installed, but this window cannot see it yet. Close this window and open Install Zeinab again.
    pause
    exit /b 1
  )
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node is installed, but npm.cmd is not on PATH yet. Close this window and open Install Zeinab again.
  pause
  exit /b 1
)

where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo Installing pnpm...
  call npm.cmd install -g pnpm@10.33.4
  if errorlevel 1 (
    echo Installing pnpm failed.
    pause
    exit /b 1
  )
  call :RefreshPath
)
where pnpm.cmd >nul 2>&1
if errorlevel 1 (
  echo pnpm.cmd is not on PATH yet. Close this window and open Install Zeinab again.
  pause
  exit /b 1
)

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
set "BRANCH=cursor/zeinab-6909"

call :EnsureCopy
if errorlevel 2 (
  pause
  exit /b 1
)
if errorlevel 1 (
  echo Could not copy Zeinab onto this PC. Check the internet connection, then open this file again.
  pause
  exit /b 1
)

git -C "%APP%" config core.longpaths true
cd /d "%APP%"
if errorlevel 1 (
  echo Could not open the Zeinab folder.
  pause
  exit /b 1
)
set "CI=true"
echo Installing the program files. This can take a few minutes.
call pnpm.cmd install
if errorlevel 1 (
  echo The install did not finish. Check the internet connection, then open this file again.
  pause
  exit /b 1
)

copy /Y "%APP%\Zeinab.cmd" "%DESKTOP%\Zeinab.cmd" >nul
echo.
echo Zeinab is installed.
echo Open the Zeinab file on the Desktop. That opens the page where you start, stop, and read.
echo.
powershell -NoProfile -Command "try { Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show('Zeinab is installed. Open the Zeinab file on the Desktop.','Zeinab') } catch { }"
pause
exit /b 0

:EnsureCopy
if not exist "%APP%\.git" goto :CloneFresh
echo Updating the copy already on this PC...
git -C "%APP%" fetch origin "%BRANCH%"
if errorlevel 1 exit /b 1
git -C "%APP%" checkout -B "%BRANCH%" "origin/%BRANCH%"
if errorlevel 1 exit /b 1
exit /b 0

:CloneFresh
if not exist "%APP%" goto :DoClone
dir /b /a "%APP%" 2>nul | findstr "." >nul
if errorlevel 1 goto :DoClone
echo Desktop\Zeinab already has other files. Rename that folder, then open this file again.
exit /b 2

:DoClone
echo Copying Zeinab onto the Desktop...
git clone --branch "%BRANCH%" https://github.com/azamasad/livetranslate.git "%APP%"
if errorlevel 1 exit /b 1
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
