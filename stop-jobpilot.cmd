@echo off
rem Stops the JobPilot server: whatever process is listening on port 5000.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force; 'Stopped JobPilot (pid ' + $_ + ')' } } else { 'JobPilot is not running' }"
