@echo off
rem Starts the JobPilot server (API + dashboard) on http://localhost:5000
rem Output goes to logs\jobpilot.log. Used by the "JobPilot" Windows task at login.
cd /d "%~dp0server"
if not exist "..\logs" mkdir "..\logs"
echo ===== %date% %time% starting ===== >> "..\logs\jobpilot.log"
node --env-file=.env src\server.js >> "..\logs\jobpilot.log" 2>&1
