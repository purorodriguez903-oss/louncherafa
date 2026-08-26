@echo off
title RAFA PANEL - SERVIDOR WEB 24/7
color 0b
echo ========================================================
echo         RAFA PANEL - INICIANDO SERVIDOR WEB 24/7
echo ========================================================
echo.
cd /d "%~dp0"
if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" server.js
) else (
    node server.js
)
pause
