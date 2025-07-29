#!/bin/bash

echo "🚀 Setup Automatico Portfolio Fotografico"
echo "=========================================="

# Controlla prerequisiti
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non è installato. Scaricalo da https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ NPM non è installato"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ NPM: $(npm --version)"

# Installa dipendenze backend
echo -e "\n📦 Installazione dipendenze backend..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dipendenze backend installate"
    else
        echo "❌ Errore nell'installazione dipendenze backend"
        exit 1
    fi
else
    echo "✅ Dipendenze backend già installate"
fi
cd ..

# Installa dipendenze frontend
echo -e "\n📦 Installazione dipendenze frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dipendenze frontend installate"
    else
        echo "❌ Errore nell'installazione dipendenze frontend"
        exit 1
    fi
else
    echo "✅ Dipendenze frontend già installate"
fi
cd ..

# Crea cartelle necessarie
echo -e "\n📁 Creazione cartelle sistema..."
mkdir -p backend/uploads
mkdir -p backend/uploads/thumbnails
mkdir -p backend/data
echo "✅ Cartelle create"

# Verifica file .env
echo -e "\n⚙️ Verifica configurazioni..."

# Backend .env
if [ ! -f "backend/.env" ]; then
    echo "📝 Creazione backend/.env..."
    cat > backend/.env << 'EOF'
# Porta del server
PORT=5000

# Ambiente
NODE_ENV=development

# Configurazione Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# CORS
ALLOWED_ORIGINS=http://localhost:3000

# Database (per future espansioni)
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=portfolio
# DB_USER=portfolio_user
# DB_PASS=portfolio_pass

# JWT Secret (per future autenticazioni)
# JWT_SECRET=your_super_secret_key_here

# Servizi esterni (per future integrazioni)
# CLOUDINARY_CLOUD_NAME=your_cloud_name
# CLOUDINARY_API_KEY=your_api_key
# CLOUDINARY_API_SECRET=your_api_secret
EOF
    echo "✅ File backend/.env creato"
else
    echo "✅ File backend/.env già presente"
fi

# Frontend .env
if [ ! -f "frontend/.env" ]; then
    echo "📝 Creazione frontend/.env..."
    cat > frontend/.env << 'EOF'
# Backend API URL
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_IMAGES_URL=http://localhost:5000

# App Configuration
REACT_APP_NAME=Portfolio Fotografico
REACT_APP_VERSION=1.0.0

# Development settings
REACT_APP_DEBUG=true
GENERATE_SOURCEMAP=true

# Performance settings
REACT_APP_ENABLE_COMPRESSION=true
REACT_APP_LAZY_LOADING=true

# Future integrations
# REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
# REACT_APP_ANALYTICS_ID=your_analytics_id
# REACT_APP_SENTRY_DSN=your_sentry_dsn
EOF
    echo "✅ File frontend/.env creato"
else
    echo "✅ File frontend/.env già presente"
fi

# Inizializza database con dati di esempio (se vuoto)
if [ ! -f "backend/data/photos.json" ]; then
    echo -e "\n🗄️ Inizializzazione database..."
    cat > backend/data/photos.json << 'EOF'
[
  {
    "id": 1,
    "title": "Foto di Esempio",
    "location": "Bologna, Emilia-Romagna, Italia",
    "lat": 44.4949,
    "lng": 11.3426,
    "image": "/uploads/example.jpg",
    "thumbnail": "/uploads/thumbnails/example_thumb.jpg",
    "description": "Questa è una foto di esempio per testare il sistema. Puoi eliminarla e caricare le tue foto!",
    "date": "2025-01-01",
    "camera": "Camera di Esempio",
    "lens": "Obiettivo di Esempio",
    "settings": {
      "aperture": "f/8",
      "shutter": "1/125s",
      "iso": "100",
      "focal": "35mm"
    },
    "tags": ["esempio", "test", "bologna"]
  }
]
EOF
    echo "✅ Database inizializzato con dati di esempio"
else
    echo "✅ Database già presente"
fi

# Crea script di avvio rapido
echo -e "\n🎬 Creazione script di avvio..."

# Script per Windows
cat > start-windows.bat << 'EOF'
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
EOF

# Script per macOS/Linux
cat > start-unix.sh << 'EOF'
#!/bin/bash

echo "🚀 Avvio Portfolio Fotografico"
echo "==============================="

echo ""
echo "📡 Avvio Backend..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

echo ""
echo "⏳ Attendo 3 secondi prima di avviare il frontend..."
sleep 3

echo ""
echo "🎨 Avvio Frontend..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Portfolio Fotografico avviato!"
echo "📡 Backend: http://localhost:5000"
echo "🎨 Frontend: http://localhost:3000"
echo ""
echo "💡 Premi Ctrl+C per fermare entrambi i server"

# Gestione interruzione
trap 'echo ""; echo "🛑 Arresto servizi..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit' INT

# Mantieni lo script in esecuzione
wait
EOF

chmod +x start-unix.sh

echo "✅ Script di avvio creati:"
echo "   Windows: start-windows.bat"
echo "   macOS/Linux: ./start-unix.sh"

# Riepilogo finale
echo -e "\n🎉 Setup completato con successo!"
echo "=================================="
echo ""
echo "📋 Cosa è stato configurato:"
echo "   ✅ Dipendenze backend e frontend installate"
echo "   ✅ Cartelle di sistema create"
echo "   ✅ File di configurazione .env creati"
echo "   ✅ Database inizializzato"
echo "   ✅ Script di avvio generati"
echo ""
echo "🚀 Prossimi passi:"
echo "1. Avvia il sistema:"
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "   Windows: doppio click su start-windows.bat"
else
    echo "   macOS/Linux: ./start-unix.sh"
fi
echo "   OPPURE manuale:"
echo "   - Terminal 1: cd backend && npm run dev"
echo "   - Terminal 2: cd frontend && npm start"
echo ""
echo "2. Apri il browser su: http://localhost:3000"
echo ""
echo "3. Testa le funzionalità:"
echo "   📸 Carica una foto"
echo "   🗺️ Visualizza sulla mappa"
echo "   🖼️ Controlla la galleria"
echo "   📱 Testa su mobile"
echo ""
echo "🔧 Se hai problemi:"
echo "   - Esegui: ./verifica-sistema.sh"
echo "   - Controlla i log nei terminal"
echo "   - Verifica che le porte 3000 e 5000 siano libere"
echo ""
echo "✨ Buon lavoro con il tuo Portfolio Fotografico!"
