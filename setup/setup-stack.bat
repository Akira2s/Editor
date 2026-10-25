@echo off
setlocal
rem Runs setup-stack.mjs interactively for a new or existing project folder.
rem Usage: double-click it, or run: setup-stack.bat [project folder]
rem Setup writes into the project folder, so a folder inside this repo is refused.

where node >nul 2>nul || (
	echo Node.js is not on PATH. Install it from https://nodejs.org and try again.
	goto :end
)

for %%I in ("%~dp0..") do set "REPO=%%~fI"

set "PROJECT=%~1"
if "%PROJECT%"=="" set /p "PROJECT=Project folder to set up (created if missing): "
if "%PROJECT%"=="" (
	echo No folder given.
	goto :end
)
set "PROJECT=%PROJECT:"=%"
for %%I in ("%PROJECT%") do set "PROJECT=%%~fI"

rem Refuse the repo itself and anything inside it.
set "CHECK=%PROJECT%\"
call set "INSIDE=%%CHECK:%REPO%\=%%"
if /i "%PROJECT%"=="%REPO%" set "INSIDE="
if not "%INSIDE%"=="%CHECK%" (
	echo %PROJECT% is inside the Editor repo. Pick a folder outside %REPO%.
	goto :end
)

if not exist "%PROJECT%\" (
	mkdir "%PROJECT%" || goto :end
) else (
	dir /b /a "%PROJECT%" 2>nul | findstr "^" >nul && (
		echo %PROJECT% is not empty. Setup keeps your scripts, scenes and assets but rewrites some config files
		echo ^(tsconfig.json, vite.config.ts, .gitignore, .gitattributes^).
		choice /c YN /n /m "Continue? [Y/N] "
		if errorlevel 2 goto :end
	)
)

echo.
echo Setting up %PROJECT%
echo.
cd /d "%PROJECT%"
node "%~dp0setup-stack.mjs"

:end
echo.
pause
