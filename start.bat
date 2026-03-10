@echo off
title BiblioVault Launcher

echo ============================================
echo   BiblioVault - Starting servers...
echo ============================================
echo.

:: Check if backend is already running
netstat -ano | findstr ":5000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [WARN] Port 5000 is already in use. Backend may already be running.
) else (
    echo [1/2] Starting Backend  ^(http://localhost:5000^)...
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

:: Ask if the user wants to expose the frontend via ngrok
echo.
set /p NGROK_CHOICE="Start ngrok tunnel for frontend (port 3000)? [y/N]: "
if /i "%NGROK_CHOICE%"=="y" (
    where ngrok >nul 2>&1
    if %ERRORLEVEL%==0 (
        echo [3/3] Starting ngrok tunnel on port 3000...
        start "BiblioVault - ngrok" cmd /k "ngrok http 3000"
    ) else (
        echo [WARN] ngrok not found in PATH. Download it from https://ngrok.com/download
        echo        and add it to your PATH, then re-run start.bat.
    )
)

echo.
echo ============================================
echo   Both servers are starting up.
echo   Backend  : http://localhost:5000
echo   Frontend : http://localhost:3000
echo.
echo   Closing a server window stops that server.
echo   Run stop.bat to stop everything at once.
echo ============================================
echo.
pause
