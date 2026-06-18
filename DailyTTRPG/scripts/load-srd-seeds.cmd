@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0load-srd-seeds.ps1" %*
