@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title 材林 - 素材之森林

if not defined PORT set "PORT=9850"
if not defined HOST set "HOST=127.0.0.1"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未找到 Node.js。
  echo 请先安装 Node.js 18 或更高版本，并确认 node 命令已加入 PATH。
  echo.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo.
  echo [错误] Node.js 版本过低，需要 18 或更高版本。
  node --version
  echo.
  pause
  exit /b 1
)

echo.
echo  材林——素材之森林
echo  地址: http://127.0.0.1:%PORT%
echo  停止: 按 Ctrl + C，或直接关闭此窗口
echo.

node server.js
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [错误] 服务异常退出，退出代码 %EXIT_CODE%。
  echo 请检查上方错误信息，或确认 %PORT% 端口没有被占用。
  echo.
  pause
)

exit /b %EXIT_CODE%
