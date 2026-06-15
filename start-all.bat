@echo off
echo Starting KRNL server on port 8000...
start "KRNL Server" cmd /c "set PORT=8000 && node "%~dp0browser-automation\distributed-app.js" --auto --query "real estate Dubai" --passes 3"
timeout /t 5 /nobreak >nul
echo Starting Cloudflare tunnel for lol.krnlcamel.space...
cloudflared tunnel --protocol http2 run krnl-node
pause