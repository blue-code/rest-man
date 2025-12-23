@echo off
setlocal
pushd "%~dp0"

echo RestMan dev runner
echo.

set "CLI_CHECK=webui\\node_modules\\@tauri-apps\\cli-win32-x64-msvc\\package.json"
if not exist "webui\\node_modules" (
  echo Installing webui dependencies...
  call npm run install:webui
  if errorlevel 1 goto :error
) else if not exist "%CLI_CHECK%" (
  echo Tauri Windows CLI not found. Reinstalling webui dependencies...
  rmdir /s /q webui\\node_modules
  call npm run install:webui
  if errorlevel 1 goto :error
)

echo Starting Tauri dev...
call npm run tauri:dev
if errorlevel 1 goto :error

echo.
echo Dev process exited.
pause
goto :eof

:error
echo.
echo A command failed. Check the output above.
pause
exit /b 1
