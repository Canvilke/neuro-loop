@echo off
chcp 65001 >nul
set GH="C:\Program Files\GitHub CLI\gh.exe"
%GH% auth login --hostname github.com --git-protocol https --web
%GH% auth status
echo.
echo 登录完成后，回到 DSH 主会话说一句「gh 登录好了」，我来建仓库并装 watcher。
pause
