@echo off
cd /d "%~dp0"
title MoeFighters production

where node >nul 2>&1 || (
  echo Node.js not found. Install it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install || (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Building production bundle...
call npm run build || (
  echo Production build failed.
  pause
  exit /b 1
)

call npm run preview -- --open
if errorlevel 1 pause
