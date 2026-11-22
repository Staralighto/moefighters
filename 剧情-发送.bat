@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --no-warnings --experimental-strip-types scripts/story.ts send
echo.
pause
