@echo off
title Mesin AI Smart Agriculture
echo Menyalakan AI Backend Engine...
cd /d "%~dp0backend"
set RUN_MODE=server
python lstm_engine.py
pause
