@echo off
title BiblioVault Stop

echo ============================================
echo   BiblioVault - Stopping servers...
echo ============================================
echo.

:: Close the named server windows (this also kills their child node processes)
echo Closing Backend server window...
taskkill /FI "WINDOWTITLE eq BiblioVault - Backend" /T /F >nul 2>&1

echo Closing Frontend server window...
taskkill /FI "WINDOWTITLE eq BiblioVault - Frontend" /T /F >nul 2>&1

echo Closing ngrok tunnel window (if open)...
taskkill /FI "WINDOWTITLE eq BiblioVault - ngrok" /T /F >nul 2>&1

:: Belt-and-suspenders: kill any node process still holding ports 5000 or 3000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    echo Releasing port 5000 ^(PID %%a^)...
    taskkill /PID %%a /T /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Releasing port 3000 ^(PID %%a^)...
    taskkill /PID %%a /T /F >nul 2>&1
)

echo.
echo ============================================
echo   All BiblioVault servers stopped.
echo ============================================
echo.
pause
