@echo off
setlocal enabledelayedexpansion

:: =====================================================================
:: 🚀 Portfolio Fotografico - Avvio Windows
:: =====================================================================
:: Script per Windows per avviare backend e frontend
:: =====================================================================

title Portfolio Fotografico

:: Colori per Windows (usando echo con colori ANSI se supportati)
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "CYAN=[96m"
set "NC=[0m"

:: Variabili
set BACKEND_PORT=5000
set FRONTEND_PORT=3000

echo.
echo %CYAN%🚀 Portfolio Fotografico - Avvio Sistema%NC%
echo %CYAN%===============================================%NC%
echo.

:: Controllo prerequisiti
echo %BLUE%🔍 Controllo prerequisiti...%NC%

if not exist "backend" (
    echo %RED%❌ Cartella backend non trovata%NC%
    echo %BLUE%ℹ️  Assicurati di essere nella directory root del progetto%NC%
    pause
    exit /b 1
)

if not exist "frontend" (
    echo %RED%❌ Cartella frontend non trovata%NC%
    echo %BLUE%ℹ️  Assicurati di essere nella directory root del progetto%NC%
    pause
    exit /b 1
)

if not exist "backend\node_modules" (
    echo %RED%❌ Dipendenze backend mancanti%NC%
    echo %BLUE%ℹ️  Esegui prima: setup-automatico.sh o installa manualmente%NC%
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo %RED%❌ Dipendenze frontend mancanti%NC%
    echo %BLUE%ℹ️  Esegui prima: setup-automatico.sh o installa manualmente%NC%
    pause
    exit /b 1
)

echo %GREEN%✅ Prerequisiti verificati%NC%
echo.

:: Controllo porte occupate
echo %BLUE%🌐 Controllo porte...%NC%

netstat -an | find "LISTENING" | find ":5000" >nul
if !errorlevel! equ 0 (
    echo %YELLOW%⚠️  Porta 5000 già occupata%NC%
    echo.
    set /p choice="Vuoi continuare comunque? (y/N): "
    if /i not "!choice!"=="y" (
        echo %RED%❌ Avvio annullato%NC%
        pause
        exit /b 1
    )
)

netstat -an | find "LISTENING" | find ":3000" >nul
if !errorlevel! equ 0 (
    echo %YELLOW%⚠️  Porta 3000 già occupata%NC%
    echo.
    set /p choice="Vuoi continuare comunque? (y/N): "
    if /i not "!choice!"=="y" (
        echo %RED%❌ Avvio annullato%NC%
        pause
        exit /b 1
    )
)

:: Creazione file batch per backend
echo @echo off > temp_backend.bat
echo title Portfolio Backend >> temp_backend.bat
echo cd backend >> temp_backend.bat
echo echo %GREEN%📡 Avvio Backend su porta %BACKEND_PORT%...%NC% >> temp_backend.bat
echo npm run dev >> temp_backend.bat
echo pause >> temp_backend.bat

:: Creazione file batch per frontend  
echo @echo off > temp_frontend.bat
echo title Portfolio Frontend >> temp_frontend.bat
echo timeout /t 5 /nobreak ^>nul >> temp_frontend.bat
echo cd frontend >> temp_frontend.bat
echo echo %GREEN%🎨 Avvio Frontend su porta %FRONTEND_PORT%...%NC% >> temp_frontend.bat
echo npm start >> temp_frontend.bat
echo pause >> temp_frontend.bat

echo.
echo %GREEN%🚀 Avvio Portfolio Fotografico...%NC%
echo.

:: Avvio backend in finestra separata
echo %BLUE%ℹ️  Avvio Backend...%NC%
start "Portfolio Backend" temp_backend.bat

:: Attesa prima di avviare frontend
echo %BLUE%ℹ️  Attendo 5 secondi prima di avviare il frontend...%NC%
timeout /t 5 /nobreak >nul

:: Avvio frontend in finestra separata
echo %BLUE%ℹ️  Avvio Frontend...%NC%
start "Portfolio Frontend" temp_frontend.bat

:: Attesa per verificare l'avvio
timeout /t 3 /nobreak >nul

echo.
echo %GREEN%✅ Portfolio Fotografico avviato!%NC%
echo.
echo %CYAN%📊 Informazioni di accesso:%NC%
echo    Frontend: http://localhost:%FRONTEND_PORT%
echo    Backend:  http://localhost:%BACKEND_PORT%
echo    API:      http://localhost:%BACKEND_PORT%/api
echo.

:: Tentativo di aprire nel browser
echo %BLUE%ℹ️  Apertura nel browser...%NC%
timeout /t 2 /nobreak >nul
start "" "http://localhost:%FRONTEND_PORT%"

echo.
echo %GREEN%✨ Sistema avviato con successo!%NC%
echo.
echo %YELLOW%💡 Note:%NC%
echo    - Backend e Frontend sono in finestre separate
echo    - Chiudi le finestre per fermare i servizi
echo    - Controlla i log nelle rispettive finestre
echo.

:: Creazione script di pulizia
echo @echo off > cleanup.bat
echo echo Pulizia file temporanei... >> cleanup.bat
echo del /q temp_backend.bat 2^>nul >> cleanup.bat
echo del /q temp_frontend.bat 2^>nul >> cleanup.bat
echo del /q cleanup.bat 2^>nul >> cleanup.bat

:: Menu interattivo
:menu
echo.
echo %CYAN%⌨️  Comandi disponibili:%NC%
echo    [O] Apri nel browser
echo    [L] Apri cartella logs
echo    [S] Mostra status porte
echo    [R] README del progetto
echo    [C] Pulisci file temporanei
echo    [Q] Esci
echo.

set /p choice="Seleziona un'opzione: "

if /i "%choice%"=="O" (
    start "" "http://localhost:%FRONTEND_PORT%"
    goto menu
)

if /i "%choice%"=="L" (
    if exist "backend.log" start notepad backend.log
    if exist "frontend.log" start notepad frontend.log
    if not exist "*.log" echo %YELLOW%⚠️  Nessun file di log trovato%NC%
    goto menu
)

if /i "%choice%"=="S" (
    echo.
    echo %BLUE%🌐 Status porte:%NC%
    netstat -an | find "LISTENING" | find ":3000"
    netstat -an | find "LISTENING" | find ":5000"
    goto menu
)

if /i "%choice%"=="R" (
    if exist "README.md" start notepad README.md
    goto menu
)

if /i "%choice%"=="C" (
    start cleanup.bat
    echo %GREEN%✅ File temporanei puliti%NC%
    goto menu
)

if /i "%choice%"=="Q" (
    goto end
)

echo %RED%❌ Opzione non valida%NC%
goto menu

:end
echo.
echo %GREEN%👋 Grazie per aver usato Portfolio Fotografico!%NC%
echo.
echo %BLUE%ℹ️  Per fermare completamente i servizi:%NC%
echo    - Chiudi le finestre di Backend e Frontend
echo    - Oppure usa Ctrl+C nelle rispettive finestre
echo.

:: Pulizia automatica alla chiusura
start /min cleanup.bat

pause
exit /b 0
