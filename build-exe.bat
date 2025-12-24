@echo off
setlocal

echo RestMan build runner
echo.

if not exist "webui\node_modules" (
  echo Installing webui dependencies...
  call npm run install:webui
  if errorlevel 1 goto :error
)

echo Closing any running RestMan instances...
taskkill /F /IM restman.exe >nul 2>&1

echo Building Tauri app...
call npm run tauri:build
if errorlevel 1 goto :error

echo.
echo Build complete. Check src-tauri\target\release\bundle
goto :eof

:error
echo.
echo A command failed. Check the output above.
exit /b 1
