@echo off
taskkill /f /im chrome.exe 2>nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9223 --profile-directory="Profile 3"
echo.
echo ✓ Chrome запущен с портом отладки 9223 и профилем Кости.
echo.
