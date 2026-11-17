@echo off
rem Starts BOTH FPGT apps on the vMix PC, each in its own window.
rem Put both app folders side by side, e.g.
rem   C:\FPGT\vMix Universal Controller\
rem   C:\FPGT\vMix Graphics Control\
rem Leave both black windows open during the show.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
set "GC="
for /d %%D in ("%~dp0..\*raphics*") do if exist "%%~fD\package.json" set "GC=%%~fD"
if defined GC (
  if not exist "%GC%\node_modules" (
    echo First run: installing vMix Graphics Control packages...
    pushd "%GC%" & call npm install & popd
  )
  start "vMix Graphics Control" /d "%GC%" cmd /k npm start
) else (
  echo vMix Graphics Control folder not found next to this one, starting vMix UC only.
)
start "vMix Universal Controller" /d "%~dp0" cmd /k node server.js --open
