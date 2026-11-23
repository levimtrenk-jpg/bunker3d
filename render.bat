@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==== bunker3d: rendering the film ====
where node >nul 2>nul || (echo [X] Node.js is missing.  winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo [X] ffmpeg is missing.  winget install Gyan.FFmpeg  ^(open a NEW terminal afterwards^) & pause & exit /b 1)
set RQ=ss=0.25^&ao=0
echo [1/2] frames + video  (the long step, ~15-25 min)
node engine\render.js video || (echo render failed & pause & exit /b 1)
echo [2/2] muxing picture + sound
node engine\render.js mux || (echo mux failed & pause & exit /b 1)
echo.
echo DONE:  %cd%\out\bunker3d.mp4
start "" "%cd%\out"
pause
