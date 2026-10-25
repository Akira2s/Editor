@echo off
setlocal
rem Builds the Babylon.js Editor in this checkout.
rem   build-editor.bat       builds the editor, plus tools and cli when they were never built
rem   build-editor.bat all   rebuilds tools, cli, the MCP server and the editor
rem setup/setup-stack.mjs copies this file from setup/fork/ to the checkout root and lists it in .git/info/exclude.

cd /d "%~dp0"
if not exist editor\package.json (
	echo Put this file in the root of the Babylon.js Editor checkout.
	goto :failed
)

rem node-gyp's .bat calls break when this is set (some Windows machines set it machine-wide).
set NoDefaultCurrentDirectoryInExePath=

call :ensure_tools || goto :failed

if not exist node_modules (
	echo Dependencies are not installed. Run setup\setup-stack.bat, or the steps in AGENT.md "Build gotchas on Windows".
	goto :failed
)

if /i "%~1"=="all" (
	call yarn build-tools || goto :failed
	call yarn build-cli || goto :failed
	call yarn build-mcp-server || goto :failed
) else (
	if not exist tools\build\src\index.js (call yarn build-tools || goto :failed)
	if not exist cli\build\src\index.mjs (call yarn build-cli || goto :failed)
)

call yarn build-editor || goto :failed
echo.
echo Build finished. Start the editor with start-editor.bat.
exit /b 0

:failed
echo.
echo Build failed.
pause
exit /b 1

rem Puts yarn and git on PATH: yarn is installed for the user when missing, git falls back to the copy in GitHub Desktop.
:ensure_tools
where node >nul 2>nul || (
	echo Node.js is not on PATH. Install it from https://nodejs.org and try again.
	exit /b 1
)
where git >nul 2>nul || for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "PATH=%%D\resources\app\git\cmd;%PATH%"
where yarn >nul 2>nul && exit /b 0
echo yarn is not installed. Installing yarn classic for your user: npm install -g yarn@1.22.22
call npm install -g yarn@1.22.22 || exit /b 1
for /f "delims=" %%P in ('npm prefix -g') do set "PATH=%%P;%PATH%"
where yarn >nul 2>nul
exit /b
