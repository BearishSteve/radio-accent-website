@echo off
setlocal
set PORT=5500
cd /d "%~dp0"

echo.
echo Starting local server for Radio Accent at http://localhost:%PORT%/

echo Checking for Python launcher...
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  start "Radio Accent Local Server" cmd /k "cd /d "%~dp0" && py -m http.server %PORT%"
  timeout /t 1 >nul
  start "" "http://localhost:%PORT%/index.html"
  goto :end
)

echo Checking for python executable...
where python >nul 2>nul
if %ERRORLEVEL%==0 (
  start "Radio Accent Local Server" cmd /k "cd /d "%~dp0" && python -m http.server %PORT%"
  timeout /t 1 >nul
  start "" "http://localhost:%PORT%/index.html"
  goto :end
)

echo.
echo No Python runtime found.
echo Install Python from https://www.python.org/downloads/
echo Then run this file again.
pause

:end
endlocal
