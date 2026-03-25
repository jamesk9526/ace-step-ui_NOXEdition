@echo off
REM OTunes By Oyama Launcher for Windows
REM Starts frontend and backend servers
setlocal

echo.
echo ===============================================
echo  OTunes By Oyama Launcher
echo ===============================================
echo.

cd /d "%~dp0"

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)

REM Check dependencies exist
if not exist "node_modules" (
    echo ERROR: Frontend dependencies not installed
    echo Please run: npm install --legacy-peer-deps
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo ERROR: Server dependencies not installed
    echo Please run: cd server && npm install --legacy-peer-deps
    pause
    exit /b 1
)

REM Check Python environment for ACE-Step
if not exist "Ace-Step1.5\env\Scripts\python.exe" (
    echo WARNING: ACE-Step Python environment not found
    echo Music generation will not work until Python venv is set up
    echo See ACESTEP_SETUP.md for instructions
    echo.
    pause
)

REM Create config directories
if not exist "server\data" mkdir "server\data"
if not exist "server\public\audio" mkdir "server\public\audio"
if not exist "server\.env" copy "server\.env.example" "server\.env" >nul 2>&1

echo.
echo Starting services...
echo.

REM Start backend (MUST be from server directory!)
echo [1/2] Starting Backend Server on port 3001...
start "OTunes By Oyama Backend" cmd /k "cd /d "%~dp0server" && npm run dev"

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM Start frontend (from root directory)
echo [2/2] Starting Frontend Server on port 5173...
start "OTunes By Oyama Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

REM Wait for frontend to start
timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:5173

echo.
echo ===============================================
echo  Services Started!
echo ===============================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo Two new terminal windows should have opened.
echo Check them for any errors or startup messages.
echo.
echo To stop:
echo   - Close both terminal windows
echo   - Or press Ctrl+C in each window
echo.
pause
