@echo off
setlocal
cd /d "%~dp0"

echo Starting the site at http://127.0.0.1:8123/
echo Press Ctrl+C to stop the server.
start "" "http://127.0.0.1:8123/"
rtk python -m http.server 8123 --bind 127.0.0.1

if errorlevel 1 (
  echo.
  echo The server could not start. Check that RTK and Python are installed and port 8123 is free.
  pause
)
