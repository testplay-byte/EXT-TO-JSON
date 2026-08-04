@echo off
REM ============================================================================
REM  EXT-TO-JSON  -  Windows one-click launcher
REM  ----------------------------------------------------------------------------
REM  Place this single .bat file in any empty folder and double-click it.
REM  It will:
REM    1. Check for Git / Node.js-or-Bun / Java  -- install any missing one
REM       automatically via winget (with a manual-download fallback).
REM    2. Clone (or update) the EXT-TO-JSON repo into a subfolder named
REM       "EXT-TO-JSON" in the SAME directory as this .bat file.
REM    3. Install npm/bun dependencies.
REM    4. Download the apktool + jadx decompilation toolchain if missing.
REM    5. Set up the SQLite database.
REM    6. Start the dev server on http://localhost:3000
REM
REM  Pure ASCII only. CRLF line endings. The window never closes on error
REM  so you can always read what happened.
REM ============================================================================

REM ---- Safety net: re-launch with cmd /k so the window NEVER closes ---------
REM  First run: %1 is empty. Re-launch ourselves with token "RUN" inside a
REM  fresh cmd /k window. Any later exit (even on parse error) keeps the
REM  window open so you can read the message.
if not "%~1"=="RUN" (
    start "" cmd /k "%~f0" RUN
    exit /b
)

setlocal enabledelayedexpansion
title EXT-TO-JSON - Setup and Run

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

REM Where this .bat lives (repo will be created as a sibling subfolder here)
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" 2>nul

echo.
echo  ============================================================
echo                EXT-TO-JSON  -  Windows Launcher
echo  ============================================================
echo.
echo  This will set up and run the EXT-TO-JSON project.
echo  It checks for required tools, installs them if missing,
echo  syncs the latest code from GitHub, downloads the apktool +
echo  jadx decompilation toolchain, and starts the dev server.
echo.
echo  If anything goes wrong, this window stays open so you can
echo  read the error and fix it.
echo.
pause
echo.

REM ============================================================================
REM  STEP 1: Git
REM ============================================================================
echo  ------------------------------------------------------------
echo   [1/6] Checking for Git...
echo  ------------------------------------------------------------
where git >nul 2>nul
if errorlevel 1 goto :git_install
for /f "delims=" %%v in ('git --version 2^>nul') do set "GITVER=%%v"
echo  [OK] !GITVER!
echo.
goto :git_done

:git_install
echo.
echo  [X]  Git is NOT installed on your computer.
echo.
echo  How would you like to install it?
echo    1. Install via winget  (recommended, automatic)
echo    2. Download the installer and run it manually
echo    3. Skip - I will install it myself
echo.
choice /c 123 /n /m "Choose an option (1, 2, or 3): "
if errorlevel 3 goto :git_skip
if errorlevel 2 goto :git_download
if errorlevel 1 goto :git_winget
goto :git_skip

:git_skip
echo.
echo  Please install Git manually from https://git-scm.com/download/win
echo  Then CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 1

:git_download
echo.
echo  Downloading Git installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/latest/download/Git-2.43.0-64-bit.exe' -OutFile '%TEMP%\git-installer.exe' -UseBasicParsing } catch { Write-Host $_.Exception.Message }"
if not exist "%TEMP%\git-installer.exe" (
    echo  [X] Download failed. Please install Git manually from https://git-scm.com/download/win
    pause
    exit /b 1
)
echo  Running Git installer - please click through it...
start /wait "" "%TEMP%\git-installer.exe"
del /q "%TEMP%\git-installer.exe" >nul 2>nul
echo.
echo  IMPORTANT: Git was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:git_winget
echo.
echo  Installing Git via winget...
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo  [X] winget install failed. Install Git manually from https://git-scm.com/download/win
    pause
    exit /b 1
)
echo.
echo  IMPORTANT: Git was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:git_done

REM ============================================================================
REM  STEP 2: Node.js (or Bun)
REM ============================================================================
echo  ------------------------------------------------------------
echo   [2/6] Checking for Node.js / Bun...
echo  ------------------------------------------------------------
set "HAS_NODE=0"
set "HAS_BUN=0"
where node >nul 2>nul
if not errorlevel 1 (
    set "HAS_NODE=1"
    for /f "delims=" %%v in ('node --version 2^>nul') do set "NODEVER=%%v"
    echo  [OK] Node.js !NODEVER!
)
where bun >nul 2>nul
if not errorlevel 1 (
    set "HAS_BUN=1"
    for /f "delims=" %%v in ('bun --version 2^>nul') do set "BUNVER=%%v"
    echo  [OK] Bun !BUNVER!
)
if "!HAS_NODE!"=="0" if "!HAS_BUN!"=="0" goto :node_install
echo.
goto :node_done

:node_install
echo.
echo  [X]  Neither Node.js nor Bun is installed.
echo.
echo  How would you like to install one?
echo    1. Install Node.js LTS via winget  (recommended)
echo    2. Download the Node.js installer manually
echo    3. Skip - I will install it myself
echo.
choice /c 123 /n /m "Choose an option (1, 2, or 3): "
if errorlevel 3 goto :node_skip
if errorlevel 2 goto :node_download
if errorlevel 1 goto :node_winget
goto :node_skip

:node_skip
echo.
echo  Please install Node.js LTS from https://nodejs.org then re-run this file.
pause
exit /b 1

:node_download
echo.
echo  Downloading Node.js LTS installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\node-installer.msi' -UseBasicParsing } catch { Write-Host $_.Exception.Message }"
if not exist "%TEMP%\node-installer.msi" (
    echo  [X] Download failed. Install Node.js manually from https://nodejs.org
    pause
    exit /b 1
)
echo  Running Node.js installer - please click through it...
start /wait "" msiexec /i "%TEMP%\node-installer.msi"
del /q "%TEMP%\node-installer.msi" >nul 2>nul
echo.
echo  IMPORTANT: Node.js was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:node_winget
echo.
echo  Installing Node.js LTS via winget...
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo  [X] winget install failed. Install Node.js manually from https://nodejs.org
    pause
    exit /b 1
)
echo.
echo  IMPORTANT: Node.js was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:node_done

REM ============================================================================
REM  STEP 3: Java (required by apktool + jadx)
REM ============================================================================
echo  ------------------------------------------------------------
echo   [3/6] Checking for Java...
echo  ------------------------------------------------------------
where java >nul 2>nul
if errorlevel 1 goto :java_install
for /f "delims=" %%v in ('java -version 2^>^&1') do (
    if not defined JAVER set "JAVER=%%v"
)
echo  [OK] !JAVER!
echo.
goto :java_done

:java_install
echo.
echo  [X]  Java is NOT installed. The converter needs Java 21+ to run
echo       apktool and jadx.
echo.
echo  How would you like to install it?
echo    1. Install Microsoft OpenJDK 21 via winget  (recommended)
echo    2. Download the installer manually
echo    3. Skip - I will install it myself
echo.
choice /c 123 /n /m "Choose an option (1, 2, or 3): "
if errorlevel 3 goto :java_skip
if errorlevel 2 goto :java_download
if errorlevel 1 goto :java_winget
goto :java_skip

:java_skip
echo.
echo  Please install Java 21+ from https://learn.microsoft.com/java/openjdk/
echo  Then CLOSE this window and double-click the .bat file again.
pause
exit /b 1

:java_download
echo.
echo  Downloading Microsoft OpenJDK 21 MSI...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://aka.ms/download-jdk/microsoft-jdk-21.0.5-windows-x64.msi' -OutFile '%TEMP%\java-installer.msi' -UseBasicParsing } catch { Write-Host $_.Exception.Message }"
if not exist "%TEMP%\java-installer.msi" (
    echo  [X] Download failed. Install Java 21+ manually.
    pause
    exit /b 1
)
echo  Running Java installer - please click through it...
start /wait "" msiexec /i "%TEMP%\java-installer.msi"
del /q "%TEMP%\java-installer.msi" >nul 2>nul
echo.
echo  IMPORTANT: Java was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:java_winget
echo.
echo  Installing Microsoft OpenJDK 21 via winget...
winget install --id Microsoft.OpenJDK.21 -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo  [X] winget install failed. Install Java 21+ manually.
    pause
    exit /b 1
)
echo.
echo  IMPORTANT: Java was just installed but this window cannot see it yet.
echo  CLOSE this window and double-click the .bat file again.
echo.
pause
exit /b 0

:java_done

REM ============================================================================
REM  STEP 4: Clone or update the repository (into a sibling subfolder)
REM ============================================================================
echo  ------------------------------------------------------------
echo   [4/6] Synchronizing repository...
echo  ------------------------------------------------------------
set "TARGET=%SCRIPT_DIR%%REPO_DIR%"

if exist "%TARGET%\.git" goto :repo_update
goto :repo_clone

:repo_update
echo  Existing project found at:
echo    %TARGET%
echo.
cd /d "%TARGET%"
if errorlevel 1 (
    echo  [X] Could not open the project folder.
    pause
    exit /b 1
)

REM Stash local changes so the pull does not fail
git diff --quiet >nul 2>nul
if errorlevel 1 (
    echo  Saving your local changes before updating...
    git stash push -u -m "ext-to-json launcher auto-stash" >nul 2>nul
)

echo  Pulling latest changes from GitHub...
git fetch origin %REPO_BRANCH% >nul 2>nul
git pull --ff-only origin %REPO_BRANCH%
if errorlevel 1 goto :pull_failed
echo.
echo  [OK] Project is up to date.
goto :repo_done

:pull_failed
echo.
echo  [!]  Pull failed. You may have conflicting local changes.
echo       1. Keep your changes and stop
echo       2. Discard your changes and force update
echo.
choice /c 12 /n /m "Choose an option (1 or 2): "
if errorlevel 2 goto :force_reset
echo  Keeping your local changes. Open the folder and run: git status
pause
exit /b 1

:force_reset
echo  Discarding local changes...
git reset --hard origin/%REPO_BRANCH%
if errorlevel 1 (
    echo  [X] Reset failed. Delete the %REPO_DIR% folder and re-run this file.
    pause
    exit /b 1
)
echo  [OK] Reset to latest version.
goto :repo_done

:repo_clone
echo  Cloning project into:
echo    %TARGET%
echo.
git clone --branch %REPO_BRANCH% %REPO_URL% "%TARGET%"
if errorlevel 1 (
    echo.
    echo  [X] Clone failed. Common causes:
    echo       - No internet connection
    echo       - The repository URL changed
    echo.
    pause
    exit /b 1
)
cd /d "%TARGET%"
if errorlevel 1 (
    echo  [X] Clone succeeded but could not open the folder.
    pause
    exit /b 1
)
echo.
echo  [OK] Project cloned.

:repo_done
for /f "delims=" %%c in ('git rev-parse --short HEAD 2^>nul') do set "COMMIT=%%c"
for /f "delims=" %%m in ('git log -1 --pretty=%%s 2^>nul') do set "MSG=%%m"
echo  Current version: !COMMIT! - !MSG!
echo.

REM ============================================================================
REM  STEP 5: Install dependencies
REM ============================================================================
echo  ------------------------------------------------------------
echo   [5/6] Installing dependencies...
echo  ------------------------------------------------------------
if exist "%TARGET%\node_modules" goto :deps_skip

if "!HAS_BUN!"=="1" (
    echo  Running: bun install  ^(takes a minute the first time^)
    echo.
    call bun install
) else (
    echo  Running: npm install  ^(takes a few minutes the first time^)
    echo.
    call npm install
)
if errorlevel 1 (
    echo.
    echo  [X] Installation failed. Common fixes:
    echo       1. Delete node_modules and package-lock.json inside %REPO_DIR%,
    echo          then re-run this file.
    echo       2. Check your internet connection.
    echo       3. Make sure Node.js is version 18 or newer.
    echo.
    pause
    exit /b 1
)
echo.
echo  [OK] Dependencies installed.
goto :deps_done

:deps_skip
echo  Dependencies already installed - skipping.
echo  ^(To reinstall: delete the node_modules folder inside %REPO_DIR%^)

:deps_done
echo.


REM ============================================================================
REM  STEP 5b: Install browser-fetch service dependencies + Playwright Chromium
REM ============================================================================
echo  ------------------------------------------------------------
echo   Installing browser-fetch service + Playwright Chromium...
echo  ------------------------------------------------------------
cd /d "%TARGET%\mini-services\browser-fetch"
if "!HAS_BUN!"=="1" (
    call bun install
) else (
    call npm install
)
if errorlevel 1 (
    echo  [!] Browser-fetch service install failed - continuing anyway.
    echo      The playground will show a warning if the service cant start.
) else (
    echo  [OK] Browser-fetch service dependencies installed.
)

echo  Installing Playwright Chromium ^(one-time, ~150MB^)...
if "!HAS_BUN!"=="1" (
    call bunx playwright install chromium
) else (
    call npx playwright install chromium
)
if errorlevel 1 (
    echo  [!] Playwright Chromium install failed - continuing anyway.
    echo      The captcha-solving feature needs Chromium.
    echo      Install later: cd mini-services\browser-fetch ^&^& bunx playwright install chromium
) else (
    echo  [OK] Playwright Chromium installed.
)
echo.
cd /d "%TARGET%"

REM ============================================================================
REM  STEP 6: Download decompilation toolchain (apktool + jadx)
REM  Uses a flag-based pattern (no goto/labels inside parenthesized blocks,
REM  which are unreliable in batch).
REM ============================================================================
echo  ------------------------------------------------------------
echo   [6/6] Verifying decompilation toolchain...
echo  ------------------------------------------------------------
cd /d "%TARGET%"

set "NEED_APKTOOL=0"
set "NEED_JADX=0"
if not exist "%APKTOOL_FILE%" set "NEED_APKTOOL=1"
if not exist "%JADX_BIN%" if not exist "%JADX_BAT%" set "NEED_JADX=1"

if "!NEED_APKTOOL!"=="0" if "!NEED_JADX!"=="0" (
    echo  [OK] tools\apktool.jar and tools\bin\jadx already present.
    goto :tools_done
)

if not exist "tools" mkdir tools

REM --- apktool ---
set "APKTOOL_OK=1"
if "!NEED_APKTOOL!"=="1" (
    echo.
    echo  Downloading apktool 2.9.3...
    if exist "%APKTOOL_FILE%" del /q "%APKTOOL_FILE%" >nul 2>nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%APKTOOL_URL%' -OutFile '%APKTOOL_FILE%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 set "APKTOOL_OK=0"
    if not exist "%APKTOOL_FILE%" set "APKTOOL_OK=0"
    set "APKSIZE=0"
    if exist "%APKTOOL_FILE%" for %%I in ("%APKTOOL_FILE%") do set "APKSIZE=%%~zI"
    if "!APKSIZE!"=="" set "APKSIZE=0"
    if !APKSIZE! LSS 1000000 set "APKTOOL_OK=0"
    if "!APKTOOL_OK!"=="1" echo  [OK] apktool.jar saved ^(!APKSIZE! bytes^)
)
if "!NEED_APKTOOL!"=="1" if "!APKTOOL_OK!"=="0" (
    echo.
    echo  [X] Failed to download apktool from:
    echo      %APKTOOL_URL%
    echo      Check your network connection and try again.
    echo.
    pause
    exit /b 1
)

REM --- jadx ---
set "JADX_OK=1"
if "!NEED_JADX!"=="1" (
    echo.
    echo  Downloading jadx 1.4.7...
    if exist "%JADX_ZIP%" del /q "%JADX_ZIP%" >nul 2>nul
    if exist "tools\bin" rmdir /s /q "tools\bin" >nul 2>nul
    if exist "tools\lib" rmdir /s /q "tools\lib" >nul 2>nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%JADX_URL%' -OutFile '%JADX_ZIP%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 set "JADX_OK=0"
    if not exist "%JADX_ZIP%" set "JADX_OK=0"
    if "!JADX_OK!"=="1" (
        echo  Extracting jadx.zip...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force -Path '%JADX_ZIP%' -DestinationPath 'tools' } catch { Write-Host $_.Exception.Message; exit 1 }"
        if errorlevel 1 set "JADX_OK=0"
        if not exist "%JADX_BIN%" if not exist "%JADX_BAT%" set "JADX_OK=0"
    )
    if "!JADX_OK!"=="1" (
        del /q "%JADX_ZIP%" >nul 2>nul
        echo  [OK] jadx extracted to tools\bin\
    )
)
if "!NEED_JADX!"=="1" if "!JADX_OK!"=="0" (
    echo.
    echo  [X] Failed to download or extract jadx.
    echo      URL: %JADX_URL%
    echo      You can manually unzip %JADX_ZIP% into the tools\ folder,
    echo      then re-run this file.
    echo.
    pause
    exit /b 1
)

:tools_done
echo.

REM ============================================================================
REM  Database setup
REM ============================================================================
echo  ------------------------------------------------------------
echo   Setting up SQLite database...
echo  ------------------------------------------------------------
if "!HAS_BUN!"=="1" (
    call bun run db:push
) else (
    call npx prisma db push --accept-data-loss
)
if errorlevel 1 (
    echo  [!] Database setup had an issue - continuing anyway.
    echo      The extension library may not persist between restarts.
) else (
    echo  [OK] Database ready.
)
echo.

REM ============================================================================
REM  Start the dev server
REM ============================================================================
cd /d "%TARGET%"
echo  ============================================================
echo                   Starting server now...
echo  ============================================================
echo.
echo  The app will be available at:
echo     http://localhost:3000
echo.
echo  ---------------------------------------------------------
echo   WHAT YOU GET
echo  ---------------------------------------------------------
echo   - Converter screen: upload an APK or import JSON
echo   - Playground screen: test a converted extension live
echo   - Settings screen: view toolchain status
echo  ---------------------------------------------------------
echo.
echo  To STOP the server:  press Ctrl + C in this window.
echo  To UPDATE later:     double-click this file again.
echo  ============================================================
echo.

if "!HAS_BUN!"=="1" (
    call bun run dev
) else (
    call npm run dev
)

echo.
echo  ============================================================
echo                   Server has stopped.
echo  ============================================================
echo.
echo  If the server crashed with an error above, read the message
echo  and fix the issue, then double-click this file again.
echo.
pause
endlocal
exit /b 0
