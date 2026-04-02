@echo off
title BiblioVault Launcher

echo ============================================
echo   BiblioVault - Starting servers...
echo ============================================
echo.

:: Check if backend is already running
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [WARN] Port 8000 is already in use. Backend may already be running.
) else (
    echo [1/2] Starting Backend  ^(http://localhost:8000^)...
    start "BiblioVault - Backend" cmd /k "cd /d %~dp0backend && npm start"
)

:: Give the backend a moment to initialise before starting the frontend
timeout /t 3 /nobreak >nul

:: Check if frontend is already running
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [WARN] Port 3000 is already in use. Frontend may already be running.
) else (
    echo [2/2] Starting Frontend ^(http://localhost:3000^)...
    start "BiblioVault - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
)

echo.
echo ============================================
echo   Both servers are starting up.
echo   Backend  : http://localhost:8000
echo   Frontend : http://localhost:3000
echo.
echo   Closing either server window will stop
echo   that server. Run stop.bat to stop both.
echo ============================================
echo.
pause
