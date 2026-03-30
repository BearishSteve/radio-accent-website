@echo off
setlocal
set PORT=5500

echo Stopping server on port %PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
  taskkill /PID %%P /F >nul 2>nul
)

echo Done.
endlocal
