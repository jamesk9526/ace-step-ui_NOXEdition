@echo off
REM ACE-Step UI Startup Script for Windows
setlocal

echo ==================================
echo    ACE-Step UI (Windows)
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: Dependencies not installed!
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

REM Check if .env files exist
if not exist ".env" (
    echo Error: .env file not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\.env" (
    echo Error: server\.env file not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

echo.
echo Starting ACE-Step UI...
echo.
echo Frontend will be available at:   http://localhost:5173
echo Backend will be available at:    http://localhost:3001
echo.
echo Make sure ACE-Step API is running (if needed):
echo   cd path\to\ACE-Step-1.5
echo   uv run acestep-api --port 8001
echo.
echo ==================================
echo.

REM Create necessary directories
if not exist "server\data" mkdir "server\data"
if not exist "server\public\audio" mkdir "server\public\audio"

REM Start backend in new window
echo Starting backend server...
start "ACE-Step UI Backend" cmd /k "cd /d "%CD%\server" && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start (3 seconds)...
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting frontend development server...
start "ACE-Step UI Frontend" cmd /k "cd /d "%CD%" && npm run dev"

REM Wait for frontend to start and try to open browser
echo Waiting for frontend to start (3 seconds)...
timeout /t 3 /nobreak >nul

REM Try to open in default browser
echo Opening application in browser...
start http://localhost:5173

echo.
echo Application should now be loading...
echo If the browser didn't open, visit: http://localhost:5173
echo.
pause
echo ==================================
echo.
echo Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000

pause
