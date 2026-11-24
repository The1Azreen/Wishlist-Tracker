@echo off
rem Starts Wishlist Tracker at http://localhost:8000 and opens it in your browser.
rem While it runs, every change is also saved to backups\wishlist.json (ignored by git).
rem Keep this window open while you use it; close it (or press Ctrl+C) to stop.
rem Port 8000 on "localhost" is the address Google sign-in is set up for (see README).
setlocal
cd /d "%~dp0"
set PORT=8000
set URL=http://localhost:%PORT%/

rem Already running (e.g. a second double-click)? Just open the page.
netstat -an | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Wishlist Tracker is already running at %URL%
  start "" "%URL%"
  exit /b 0
)

rem Find Python: "python", else the "py" launcher.
set PY=
python --version >nul 2>nul && set PY=python
if not defined PY (
  py -3 --version >nul 2>nul && set PY=py -3
)
if not defined PY (
  echo Python is not installed. Get it from https://www.python.org/downloads/ and run this again.
  pause
  exit /b 1
)

rem serve.py serves the app and saves the automatic local copy into backups\ (see serve.py).
start "" "%URL%"
%PY% serve.py %PORT%
if errorlevel 1 pause
