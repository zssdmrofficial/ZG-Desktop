@echo off
setlocal enabledelayedexpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"

set "DRIVE="
set "EXITCODE=0"
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
set "EXITCODE=1"
goto :cleanup

:drive_ready
pushd %DRIVE%\

cmake -S native/update-helper -B native/update-helper/build -G "Visual Studio 17 2022" -A x64
if not %errorlevel%==0 (
  set "EXITCODE=%errorlevel%"
  goto :cleanup
)

cmake --build native/update-helper/build --config Release
if not %errorlevel%==0 (
  set "EXITCODE=%errorlevel%"
  goto :cleanup
)

popd

call npm run make
if not %errorlevel%==0 (
  set "EXITCODE=%errorlevel%"
  goto :cleanup
)

where iscc >nul 2>&1
if not %errorlevel%==0 (
  echo ISCC not found. Install Inno Setup or add ISCC to PATH.
  set "EXITCODE=1"
  goto :cleanup
)

iscc ZG-Desktop.iss
if not %errorlevel%==0 (
  set "EXITCODE=%errorlevel%"
  goto :cleanup
)

set "EXITCODE=0"

echo Build complete.
goto :cleanup

:cleanup
if defined DRIVE (
  subst %DRIVE% /d >nul 2>&1
)
exit /b %EXITCODE%
