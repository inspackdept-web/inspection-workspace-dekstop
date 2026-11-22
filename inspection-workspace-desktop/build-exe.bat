@echo off
title Build Inspection Workspace Desktop EXE
echo ============================================================================
echo   MEMBUAT FILE .EXE INSPECTION WORKSPACE (WINDOWS 64-BIT)
echo ============================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [!] Node.js belum terpasang di PC ini.
  echo     Anda punya 2 pilihan mudah:
  echo     1. Tanpa install apa pun di PC: Upload folder ini ke GitHub, lalu download
  echo        file .EXE yang otomatis di-build di menu "Actions" GitHub!
  echo     2. Atau install Node.js LTS dari https://nodejs.org lalu klik 2x file ini lagi.
  echo.
  pause
  exit /b 1
)

echo [1/2] Mengunduh komponen Electron...
call npm install
if %errorlevel% neq 0 (
  echo [!] Gagal menjalankan npm install.
  pause
  exit /b 1
)

echo.
echo [2/2] Membuat Installer Setup.exe dan Portable.exe di folder dist\...
call npm run dist
if %errorlevel% neq 0 (
  echo [!] Gagal membuat file .EXE.
  pause
  exit /b 1
)

echo.
echo [SELESAI!] File .EXE Anda sudah jadi di dalam folder: dist\
explorer dist
pause
