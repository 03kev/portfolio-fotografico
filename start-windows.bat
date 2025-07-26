@echo off
echo Avvio Portfolio Fotografico...
echo ===============================

echo.
echo Avvio Backend...
start "Backend" cmd /k "cd backend && npm run dev"

echo.
echo Attendo 3 secondi prima di avviare il frontend...
timeout /t 3 /nobreak > nul

echo.
echo Avvio Frontend...
start "Frontend" cmd /k "cd frontend && npm start"

echo.
echo Portfolio Fotografico in avvio!
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
pause
