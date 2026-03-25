@echo off
REM ACE-Step UI - Utility Script to Check/Kill Ports
setlocal

echo.
echo ===============================================
echo   ACE-Step Port Diagnostic Tool
echo ===============================================
echo.

set /p ACTION="What would you like to do? (1=Check ports, 2=Kill port, 3=Kill all ACE-Step): "

if "%ACTION%"=="1" goto CHECK
if "%ACTION%"=="2" goto KILL_SINGLE
if "%ACTION%"=="3" goto KILL_ALL
goto END

:CHECK
echo.
echo Checking ports...
echo.
echo Port 8001 (ACE-Step API):
netstat -ano | findstr :8001
if %ERRORLEVEL% NEQ 0 echo  - Not in use
echo.
echo Port 3001 (Backend):
netstat -ano | findstr :3001
if %ERRORLEVEL% NEQ 0 echo  - Not in use
echo.
echo Port 5173 (Frontend):
netstat -ano | findstr :5173
if %ERRORLEVEL% NEQ 0 echo  - Not in use
echo.
goto END

:KILL_SINGLE
echo.
set /p PORT="Enter port number (8001, 3001, or 5173): "
echo.
echo Looking for process on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    echo Found process ID: %%a
    echo Killing process...
    taskkill /PID %%a /F
)
echo.
goto END

:KILL_ALL
echo.
echo Killing ACE-Step processes...
taskkill /IM node.exe /F 2>nul
taskkill /IM python.exe /F 2>nul
echo Done.
echo.
goto END

:END
echo.
pause
