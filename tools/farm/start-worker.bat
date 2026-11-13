@echo off
REM =====================================================================
REM  Render farm worker -- double-click me to put this PC to work.
REM
REM  You will need TWO things, neither of which installs anything:
REM    1) the project folder copied here (including node_modules)
REM    2) a portable Node.js ZIP extracted to C:\node
REM       (https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip)
REM
REM  Nothing is registered, nothing needs admin rights.
REM =====================================================================

set NODE_EXE=C:\node\node.exe
REM  <-- change this to this PC's LAN name or IP of the main machine
set SERVER_IP=192.168.1.X
set LABEL=i7-3770
set CONC=3

cd /d "%~dp0..\.."

if not exist "%NODE_EXE%" (
  echo portable Node not found at %NODE_EXE%
  echo extract node-v22.14.0-win-x64.zip to C:\node and try again
  pause
  exit /b 1
)

"%NODE_EXE%" tools\farm\agent.mjs --server=http://%SERVER_IP%:4000 --label="%LABEL%" --conc=%CONC%

pause
