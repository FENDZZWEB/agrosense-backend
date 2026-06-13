@echo off
title Mesin AI Smart Agriculture
echo Menyalakan AI Backend Engine...
cd /d "%~dp0backend"
python lstm_engine.py
pause
