@echo off
chcp 65001 >nul
title Changzheng public demo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-public-demo.ps1"
