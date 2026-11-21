@echo off
cd /d "%~dp0"
node tools\present.mjs
if errorlevel 1 pause
