@echo off
title BiblioVault Status

echo ============================================
echo   BiblioVault - Server Status
echo ============================================
echo.

:: Check Backend (port 8000)
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [RUNNING]  Backend   http://localhost:8000
) else (
    echo [STOPPED]  Backend   http://localhost:8000
)

:: Check Frontend (port 3000)
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [RUNNING]  Frontend  http://localhost:3000
) else (
    echo [STOPPED]  Frontend  http://localhost:3000
)

echo.
echo ============================================
echo.
pause
