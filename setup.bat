@echo off
REM ACE-Step UI Setup Script for Windows
setlocal enabledelayedexpansion

echo ==================================
echo    ACE-Step UI Setup (Windows)
echo ==================================
echo.

REM ── 1. Check Node.js ──────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo Node.js: %%i

REM ── 2. Check Python ───────────────────────────────────────────────────────
set PYTHON_EXE=
for %%p in (python python3) do (
    if "!PYTHON_EXE!"=="" (
        where %%p >nul 2>&1
        if !ERRORLEVEL! EQU 0 set PYTHON_EXE=%%p
    )
)
if "%PYTHON_EXE%"=="" (
    echo ERROR: Python not found.
    echo Please install Python 3.10+ from https://www.python.org/
    echo Check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('%PYTHON_EXE% --version') do echo Python: %%i

REM ── 3. Install frontend npm dependencies ──────────────────────────────────
echo.
echo [1/5] Installing frontend dependencies...
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install frontend dependencies.
    pause
    exit /b 1
)

REM ── 4. Install server npm dependencies ────────────────────────────────────
echo.
echo [2/5] Installing server dependencies...
cd server
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Server dependencies failed to install.
    echo This can happen if Python or Visual C++ Build Tools are missing.
    echo.
    echo  - Visual C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo.
    pause
    cd ..
    exit /b 1
)
cd ..

REM ── 5. Set up Python venv for ACE-Step generation ─────────────────────────
echo.
echo [3/5] Setting up Python virtual environment for ACE-Step...

set VENV_DIR=%~dp0Ace-Step1.5\env
set VENV_PYTHON=%VENV_DIR%\Scripts\python.exe

if not exist "%VENV_PYTHON%" (
    echo   Creating virtual environment at Ace-Step1.5\env ...
    %PYTHON_EXE% -m venv "%VENV_DIR%"
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create Python virtual environment.
        pause
        exit /b 1
    )
    echo   Virtual environment created.
) else (
    echo   Virtual environment already exists.
)

REM ── 6. Install / fix pinned Python packages ────────────────────────────────
echo.
echo [4/5] Installing required Python packages (pinned versions)...
echo   This ensures compatible versions of transformers, tokenizers,
echo   huggingface-hub, and vector_quantize_pytorch are installed.
echo.

REM Install huggingface-hub first at the version transformers 4.5x requires
"%VENV_PYTHON%" -m pip install --quiet --upgrade pip
"%VENV_PYTHON%" -m pip install --quiet ^
    "huggingface-hub>=0.34.0,<1.0" ^
    "tokenizers>=0.22.0,<0.23.0" ^
    "transformers>=4.51.0,<4.58.0" ^
    "vector_quantize_pytorch"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install Python packages.
    pause
    exit /b 1
)
echo   Python packages installed successfully.

REM Remove any corrupt leftover ~okenizers dist-info directories
for /d %%d in ("%VENV_DIR%\Lib\site-packages\~okenizers*") do (
    echo   Removing corrupt package residue: %%~nd
    rd /s /q "%%d" >nul 2>&1
)

REM ── 7. Create .env files ───────────────────────────────────────────────────
echo.
echo [5/5] Creating configuration files...

if not exist ".env" (
    copy .env.example .env >nul 2>&1
    if %ERRORLEVEL% EQU 0 (echo   Created .env) else (echo   Warning: could not create .env)
)
if not exist "server\.env" (
    copy server\.env.example server\.env >nul 2>&1
    if %ERRORLEVEL% EQU 0 (echo   Created server\.env) else (echo   Warning: could not create server\.env)
)

REM Create necessary directories
if not exist "server\data"         mkdir "server\data"
if not exist "server\public"       mkdir "server\public"
if not exist "server\public\audio" mkdir "server\public\audio"

echo.
echo ==================================
echo    Setup Complete!
echo ==================================
echo.
echo Start the application with:
echo   launcher.bat      - starts everything (recommended)
echo   start.bat         - starts frontend + backend
echo   start-all.bat     - starts frontend + backend + ACE-Step API
echo.
pause
