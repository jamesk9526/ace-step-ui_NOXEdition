@echo off
REM ACE-Step UI Complete Startup Script for Windows
REM Starts ACE-Step API + Backend + Frontend
setlocal

echo.
echo ==================================
echo   ACE-Step Complete Startup
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: UI dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

cd /d "%~dp0"

REM Get ACE-Step path from environment or use default
if "%ACESTEP_PATH%"=="" (
    set ACESTEP_PATH=%~dp0Ace-Step1.5
)

REM Check if ACE-Step exists
if not exist "%ACESTEP_PATH%" (
    echo.
    echo Warning: ACE-Step not found at "%ACESTEP_PATH%"
    echo.
    echo Please ensure ACE-Step1.5 folder exists in:
    echo %ACESTEP_PATH%
    echo.
    pause
    exit /b 1
)

REM Detect ACE-Step installation type
set API_COMMAND=
if exist "%ACESTEP_PATH%\python_embeded\python.exe" (
    echo + Detected Windows Portable Package
    set API_COMMAND=python_embeded\python acestep\api_server.py
) else (
    echo + Detected Standard Installation
    set API_COMMAND=uv run acestep-api --port 8001
)

echo.
echo ==================================
echo   Starting All Services...
echo ==================================
echo.

REM Start ACE-Step API in new window
echo [1/3] Starting ACE-Step API server...
start "ACE-Step API Server" cmd /k "cd /d "%ACESTEP_PATH%" && %API_COMMAND%"
timeout /t 5 /nobreak >nul

REM Start backend in new window
echo [2/3] Starting backend server...
start "ACE-Step UI Backend" cmd /k "cd server && npm run dev"
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo [3/3] Starting frontend server...
start "ACE-Step UI Frontend" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ==================================
echo   All Services Running!
echo ==================================
echo.
echo   ACE-Step API: http://localhost:8001
echo   Backend:      http://localhost:3001
echo   Frontend:     http://localhost:5173
echo.
echo   Close the terminal windows to stop all services.
echo.
echo Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo Press any key to close this window (services will keep running)
pause >nul

