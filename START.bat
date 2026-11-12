@echo off
setlocal EnableExtensions DisableDelayedExpansion

title Shadow of the Laughing - Game Server
cd /d "%~dp0"

echo ============================================
echo   Shadow of the Laughing - Multiplayer Server
echo ============================================
echo.

rem ---- Check for Node.js ----
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org
    echo Then run START.bat again.
    echo.
    pause
    exit /b 1
)

rem ---- Check project files exist in this folder ----
if not exist "%~dp0package.json" (
    echo [ERROR] package.json not found.
    echo Please keep START.bat in the project root folder.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0server.js" (
    echo [ERROR] server.js not found.
    echo Please keep START.bat in the project root folder.
    echo.
    pause
    exit /b 1
)

rem ---- Install dependencies if missing ----
if not exist "%~dp0node_modules" (
    echo [INFO] Dependencies are not installed yet.
    echo [INFO] Running npm install ...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies installed successfully.
    echo.
)

rem ---- Start the server ----
echo [INFO] Starting the game server ...
echo [INFO] Open http://localhost:3000 in your browser.
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.
call npm start

rem ---- Keep the window open no matter how the server stopped ----
echo.
echo ============================================
echo   The server has stopped.
echo   Press any key to close this window.
echo ============================================
pause
exit /b 0