@echo off
chcp 65001 > nul
echo ========================================================
echo        e-Okul Spead - Yerel Sunucu Başlatılıyor...
echo ========================================================
echo.
echo Tarayıcınız açılıyor: http://localhost:8080
start "" "http://localhost:8080"
python -m http.server 8080
pause
