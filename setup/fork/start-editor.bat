@echo off
setlocal
rem Starts the Babylon.js Editor built in this checkout.
rem setup/setup-stack.mjs copies this file from setup/fork/ to the checkout root and lists it in .git/info/exclude.

cd /d "%~dp0"
if not exist editor\package.json (
	echo Put this file in the root of the Babylon.js Editor checkout.
	goto :failed
)

where node >nul 2>nul || (
	echo Node.js is not on PATH. Install it from https://nodejs.org and try again.
	goto :failed
)

if not exist editor\build\src\index.js (
	echo The editor is not built yet. Run build-editor.bat first.
	goto :failed
)

rem The editor is started with Electron directly, so yarn is not needed here.
if not exist editor\node_modules\.bin\electron.cmd if not exist node_modules\.bin\electron.cmd (
	echo Electron is not installed. Run setup\setup-stack.bat, or the steps in AGENT.md "Build gotchas on Windows".
	goto :failed
)

cd editor
if exist node_modules\.bin\electron.cmd (call node_modules\.bin\electron.cmd .) else (call ..\node_modules\.bin\electron.cmd .)
if errorlevel 1 (
	echo.
	echo The editor exited with an error.
	goto :failed
)
exit /b 0

:failed
echo.
pause
exit /b 1
