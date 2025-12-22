@echo off
setlocal

echo RestMan dev runner
echo.

if not exist "webui\\node_modules" (
  echo Installing webui dependencies...
  call npm run install:webui
  if errorlevel 1 goto :error
)

echo Starting Tauri dev...
call npm run tauri:dev
if errorlevel 1 goto :error

goto :eof

:error
echo.
echo A command failed. Check the output above.
exit /b 1
