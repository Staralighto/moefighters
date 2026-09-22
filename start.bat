@echo off
cd /d "%~dp0"
title MoeFighters

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

call npm run dev -- --open
if errorlevel 1 pause