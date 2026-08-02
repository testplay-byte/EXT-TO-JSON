@echo off
REM ============================================================================
REM  EXT-TO-JSON - Windows double-click launcher
REM  ----------------------------------------------------------------------------
REM  Clones/pulls the repo, checks for Git/Node-or-Bun/Java, downloads the
REM  apktool + jadx toolchain if missing, runs db setup, and starts the dev
REM  server on http://localhost:3000.
REM
REM  Pure ASCII. CRLF line endings. Re-launches itself with cmd /k so the
REM  window never closes on failure - you can read the error.
REM ============================================================================

REM ---- Configurable variables ------------------------------------------------
set "REPO_URL=https://github.com/testplay-byte/EXT-TO-JSON.git"
set "REPO_BRANCH=main"
set "REPO_DIR=EXT-TO-JSON"
set "APKTOOL_URL=https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar"
set "APKTOOL_FILE=tools\apktool.jar"
set "JADX_URL=https://github.com/skylot/jadx/releases/download/v1.4.7/jadx-1.4.7.zip"
set "JADX_ZIP=tools\jadx.zip"
set "JADX_BIN=tools\bin\jadx"
set "JADX_BAT=tools\bin\jadx.bat"

REM ---- Safety net: re-launch with cmd /k so the window stays open ------------
REM  The first time the .bat is double-clicked, %1 is empty. We re-launch
REM  ourselves with the literal token "RUN" so any exit keeps the window open.
if /i not "%~1"=="RUN" (
    start "" cmd /k "%~f0" RUN
    exit /b
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" 2>nul

echo.
echo ============================================================
echo   EXT-TO-JSON launcher
echo   Repo:   %REPO_URL%
echo   Branch: %REPO_BRANCH%
echo   Folder: %SCRIPT_DIR%%REPO_DIR%
echo ============================================================
echo.

REM ============================================================================
REM  1. Tool checks
REM ============================================================================

echo [1/6] Checking tools...

REM --- Git ---
where git >nul 2>nul
if errorlevel 1 (
    echo.
    echo [!] Git not found on PATH.
    echo     Install Git for Windows from https://git-scm.com/download/win
    echo     or run:  winget install --id Git.Git -e
    echo.
    echo     Close this window, install Git, then double-click START.bat again.
    echo.
    pause
    exit /b 1
)
echo     [ok] git found

REM --- Node OR Bun (need at least one) ---
set "HAS_NODE=0"
set "HAS_BUN=0"
where node >nul 2>nul
if not errorlevel 1 set "HAS_NODE=1"
where bun >nul 2>nul
if not errorlevel 1 set "HAS_BUN=1"

if "%HAS_NODE%"=="0" if "%HAS_BUN%"=="0" (
    echo.
    echo [!] Neither Node.js nor Bun was found on PATH.
    echo     Install one of them:
    echo       - Bun ^(recommended, faster^): https://bun.sh/
    echo         or:  winget install --id Oven-sh.Bun -e
    echo       - Node.js 18+: https://nodejs.org/
    echo         or:  winget install --id OpenJS.NodeJS.LTS -e
    echo.
    echo     Close this window, install Bun or Node, then double-click
    echo     START.bat again.
    echo.
    pause
    exit /b 1
)
if "%HAS_BUN%"=="1" (
    echo     [ok] bun found  ^(will use bun install / bun run dev^)
) else (
    echo     [ok] node found, bun not found ^(will use npm install / npm run dev^)
)

REM --- Java (required by apktool + jadx) ---
where java >nul 2>nul
if errorlevel 1 (
    echo.
    echo [!] Java not found on PATH. The converter needs Java 21+ to run
    echo     apktool and jadx.
    echo.
    echo     Recommended: install Microsoft OpenJDK 21 via winget:
    echo.
    echo         winget install --id Microsoft.OpenJDK.21 -e
    echo.
    echo     Or download from https://learn.microsoft.com/java/openjdk/
    echo.
    echo     Close this window, install Java, then double-click START.bat again.
    echo.
    pause
    exit /b 1
)
echo     [ok] java found

echo.

REM ============================================================================
REM  2. Clone or pull the repo
REM ============================================================================
echo [2/6] Synchronizing repository...

if exist "%REPO_DIR%\.git" (
    echo     Existing clone found, pulling latest...
    cd /d "%SCRIPT_DIR%%REPO_DIR%"

    git fetch origin %REPO_BRANCH% >nul 2>nul
    git status --porcelain >"%TEMP%\ext_to_json_status.txt" 2>nul
    for %%I in ("%TEMP%\ext_to_json_status.txt") do set "STAT_SIZE=%%~zI"
    if defined STAT_SIZE if not "%STAT_SIZE%"=="0" (
        echo     Local changes detected - stashing...
        git stash push -u -m "ext-to-json launcher auto-stash" >nul 2>nul
    )
    git pull --ff-only origin %REPO_BRANCH%
    if errorlevel 1 (
        echo     Fast-forward failed - resetting to origin/%REPO_BRANCH%...
        git reset --hard origin/%REPO_BRANCH%
        if errorlevel 1 (
            echo.
            echo [!] Could not sync the repository.
            echo     Close this window, delete the %REPO_DIR% folder, and
            echo     double-click START.bat again for a fresh clone.
            echo.
            pause
            exit /b 1
        )
    )
) else (
    echo     Cloning fresh into %REPO_DIR%...
    git clone --branch %REPO_BRANCH% %REPO_URL% "%REPO_DIR%"
    if errorlevel 1 (
        echo.
        echo [!] git clone failed. Check your network connection and that
        echo     the repo URL is correct: %REPO_URL%
        echo.
        pause
        exit /b 1
    )
    cd /d "%SCRIPT_DIR%%REPO_DIR%"
)

echo.

REM ============================================================================
REM  3. Install dependencies
REM ============================================================================
echo [3/6] Installing dependencies...

if "%HAS_BUN%"=="1" (
    bun install
) else (
    npm install
)
if errorlevel 1 (
    echo.
    echo [!] Dependency install failed.
    echo.
    pause
    exit /b 1
)

echo.

REM ============================================================================
REM  4. Download decompilation toolchain (apktool + jadx) if missing
REM ============================================================================
echo [4/6] Verifying decompilation toolchain...

set "NEED_APKTOOL=0"
set "NEED_JADX=0"

if not exist "%APKTOOL_FILE%" set "NEED_APKTOOL=1"
if not exist "%JADX_BIN%" if not exist "%JADX_BAT%" set "NEED_JADX=1"

if "%NEED_APKTOOL%"=="0" if "%NEED_JADX%"=="0" (
    echo     tools\apktool.jar and tools\bin\jadx already present - skipping.
    goto :toolchain_done
)

if not exist "tools" mkdir tools

if "%NEED_APKTOOL%"=="1" (
    echo     Downloading apktool 2.9.3...
    if exist "%APKTOOL_FILE%" del /q "%APKTOOL_FILE%" >nul 2>nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%APKTOOL_URL%' -OutFile '%APKTOOL_FILE%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo.
        echo [!] Failed to download apktool from:
        echo     %APKTOOL_URL%
        echo     Check your network connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo     [ok] apktool.jar saved
)

if "%NEED_JADX%"=="1" (
    echo     Downloading jadx 1.4.7...
    if exist "%JADX_ZIP%" del /q "%JADX_ZIP%" >nul 2>nul
    if exist "tools\bin" rmdir /s /q "tools\bin" >nul 2>nul
    if exist "tools\lib" rmdir /s /q "tools\lib" >nul 2>nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%JADX_URL%' -OutFile '%JADX_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo.
        echo [!] Failed to download jadx from:
        echo     %JADX_URL%
        echo     Check your network connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo     Extracting jadx.zip...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force -Path '%JADX_ZIP%' -DestinationPath 'tools' } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo.
        echo [!] Failed to extract jadx.zip.
        echo     Manually unzip %JADX_ZIP% into the tools\ folder, then
        echo     re-run START.bat.
        echo.
        pause
        exit /b 1
    )
    del /q "%JADX_ZIP%" >nul 2>nul
    echo     [ok] jadx extracted to tools\bin\jadx^(.bat^)
)

:toolchain_done
echo.

REM ============================================================================
REM  5. Database setup
REM ============================================================================
echo [5/6] Setting up SQLite database...

if "%HAS_BUN%"=="1" (
    bun run db:push
) else (
    call npx prisma db push --accept-data-loss
)
if errorlevel 1 (
    echo.
    echo [!] Database setup failed. See the message above.
    echo     You can usually ignore this and continue - the dev server will
    echo     start, but the extension library may not persist.
    echo.
    pause
)

echo.

REM ============================================================================
REM  6. Start the dev server
REM ============================================================================
echo [6/6] Starting dev server on http://localhost:3000 ...
echo.
echo ============================================================
echo   The app is starting. Open this URL in your browser:
echo.
echo       http://localhost:3000
echo.
echo   - Converter screen: upload an APK or import JSON
echo   - Playground screen: test a converted extension live
echo   - Settings screen: view toolchain status
echo.
echo   Press Ctrl+C in this window to stop the server.
echo ============================================================
echo.

if "%HAS_BUN%"=="1" (
    bun run dev
) else (
    npm run dev
)

echo.
echo ------------------------------------------------------------
echo   Dev server stopped.
echo ------------------------------------------------------------
echo.
pause
exit /b 0
