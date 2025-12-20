@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"

set "DRIVE="
for %%D in (X Y Z W V U T S R Q P O N M L K J I H G F E D) do (
  subst %%D: >nul 2>&1
  if !errorlevel! equ 0 (
    subst %%D: /d >nul 2>&1
  )
  subst %%D: "%ROOT%" >nul 2>&1
  if !errorlevel! equ 0 (
    set "DRIVE=%%D:"
    goto :drive_ready
  )
)
echo Failed to map a drive letter. Please close any existing SUBST mapping and retry.
exit /b 1

:drive_ready
pushd %DRIVE%\

cmake -S native/update-helper -B native/update-helper/build -G "Visual Studio 17 2022" -A x64
if not %errorlevel%==0 exit /b %errorlevel%

cmake --build native/update-helper/build --config Release
if not %errorlevel%==0 exit /b %errorlevel%

popd

call npm run make
if not %errorlevel%==0 exit /b %errorlevel%

where iscc >nul 2>&1
if not %errorlevel%==0 (
  echo ISCC not found. Install Inno Setup or add ISCC to PATH.
  exit /b 1
)

iscc ZG-Desktop.iss
if not %errorlevel%==0 exit /b %errorlevel%

subst %DRIVE% /d >nul 2>&1

echo Build complete.
exit /b 0
