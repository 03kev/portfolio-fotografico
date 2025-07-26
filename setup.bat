@echo off
title Portfolio Fotografico Setup

echo 🚀 Avvio Portfolio Fotografico...

REM Controlla se Node.js è installato
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js non è installato. Installa Node.js prima di continuare.
    pause
    exit /b 1
)

REM Controlla se npm è installato  
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm non è installato. Installa npm prima di continuare.
    pause
    exit /b 1
)

echo 📝 Configurazione file di ambiente...

REM Crea file .env se non esistono
if not exist "backend\.env" (
    echo 📄 Creazione backend\.env...
    copy "backend\.env.example" "backend\.env" >nul
    echo ✅ File backend\.env creato. Modifica le configurazioni se necessario.
)

if not exist "frontend\.env" (
    echo 📄 Creazione frontend\.env...
    copy "frontend\.env.example" "frontend\.env" >nul
    echo ✅ File frontend\.env creato. Modifica le configurazioni se necessario.
)

echo 📁 Creazione cartelle necessarie...
if not exist "backend\uploads" mkdir "backend\uploads"
if not exist "backend\uploads\thumbnails" mkdir "backend\uploads\thumbnails"
echo ✅ Cartelle uploads create.

echo 📦 Installazione dipendenze backend...
cd backend
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        echo ❌ Errore nell'installazione delle dipendenze del backend
        pause
        exit /b 1
    )
    echo ✅ Dipendenze backend installate.
) else (
    echo ✅ Dipendenze backend già installate.
)
cd ..

echo 📦 Installazione dipendenze frontend...
cd frontend
if not exist "node_modules" (
    call npm install
    if errorlevel 1 (
        echo ❌ Errore nell'installazione delle dipendenze del frontend
        pause
        exit /b 1
    )
    echo ✅ Dipendenze frontend installate.
) else (
    echo ✅ Dipendenze frontend già installate.
)
cd ..

echo.
echo 🎉 Setup completato con successo!
echo.
echo 📊 Per avviare il progetto:
echo    Backend:  cd backend ^&^& npm run dev
echo    Frontend: cd frontend ^&^& npm start
echo.
echo 🌐 URL di accesso:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo    API:      http://localhost:5000/api
echo.
echo 📝 Ricorda di configurare i file .env prima dell'avvio!
echo.

pause
