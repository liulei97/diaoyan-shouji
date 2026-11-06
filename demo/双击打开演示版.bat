@echo off
chcp 936 >nul
title 调研手记 · 只读演示版（本地）
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist "%~dp0index.html" (
  echo [错误] 这个文件夹里没有 index.html，是不是只复制了本文件？
  echo         整个 demo 文件夹一起拷，不要拆开。
  pause
  exit /b 1
)

set "PORT="
for %%P in (8899 8900 8901 8902 8903 8904) do (
  if not defined PORT (
    netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul || set "PORT=%%P"
  )
)
if not defined PORT set "PORT=8899"

echo.
echo   调研手记 · 只读演示版
echo   --------------------------------------------
echo   浏览器稍后自动打开；没打开就手动访问：
echo   http://localhost:%PORT%/
echo.
echo   数据是合成示例，随便点，改不了。关掉本窗口即停止。
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"

set "PY="
python -c "print(1)" >nul 2>nul && set "PY=python"
if not defined PY ( py -3 -c "print(1)" >nul 2>nul && set "PY=py -3" )

if defined PY (
  %PY% -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0."
  goto :eof
)

echo 本机没装 Python，改用系统自带的 PowerShell 起服务（首次可能要等几秒）...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT%
