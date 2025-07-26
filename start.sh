#!/bin/bash

# Script per avviare l'intero progetto Portfolio Fotografico

echo "🚀 Avvio Portfolio Fotografico..."

# Controlla se Node.js è installato
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non è installato. Installa Node.js prima di continuare."
    exit 1
fi

# Controlla se npm è installato
if ! command -v npm &> /dev/null; then
    echo "❌ npm non è installato. Installa npm prima di continuare."
    exit 1
fi

# Crea file .env se non esistono
echo "📝 Configurazione file di ambiente..."

if [ ! -f "backend/.env" ]; then
    echo "📄 Creazione backend/.env..."
    cp backend/.env.example backend/.env
    echo "✅ File backend/.env creato. Modifica le configurazioni se necessario."
fi

if [ ! -f "frontend/.env" ]; then
    echo "📄 Creazione frontend/.env..."
    cp frontend/.env.example frontend/.env
    echo "✅ File frontend/.env creato. Modifica le configurazioni se necessario."
fi

# Crea cartella uploads per il backend
echo "📁 Creazione cartelle necessarie..."
mkdir -p backend/uploads
mkdir -p backend/uploads/thumbnails
echo "✅ Cartelle uploads create."

# Installa dipendenze backend
echo "📦 Installazione dipendenze backend..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Errore nell'installazione delle dipendenze del backend"
        exit 1
    fi
    echo "✅ Dipendenze backend installate."
else
    echo "✅ Dipendenze backend già installate."
fi
cd ..

# Installa dipendenze frontend
echo "📦 Installazione dipendenze frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Errore nell'installazione delle dipendenze del frontend"
        exit 1
    fi
    echo "✅ Dipendenze frontend installate."
else
    echo "✅ Dipendenze frontend già installate."
fi
cd ..

# Funzione per avviare il backend
start_backend() {
    echo "🔧 Avvio backend..."
    cd backend
    npm run dev &
    BACKEND_PID=$!
    echo "✅ Backend avviato su http://localhost:5000 (PID: $BACKEND_PID)"
    cd ..
}

# Funzione per avviare il frontend
start_frontend() {
    echo "🎨 Avvio frontend..."
    cd frontend
    npm start &
    FRONTEND_PID=$!
    echo "✅ Frontend avviato su http://localhost:3000 (PID: $FRONTEND_PID)"
    cd ..
}

# Avvia backend e frontend
start_backend
sleep 3
start_frontend

echo ""
echo "🎉 Portfolio Fotografico avviato con successo!"
echo ""
echo "📊 Status:"
echo "   Backend:  http://localhost:5000"
echo "   Frontend: http://localhost:3000"
echo "   API:      http://localhost:5000/api"
echo ""
echo "🛑 Per fermare i servizi, premi Ctrl+C"
echo ""

# Funzione di cleanup
cleanup() {
    echo ""
    echo "🛑 Interruzione servizi..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo "✅ Backend fermato"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo "✅ Frontend fermato"
    fi
    echo "👋 Arrivederci!"
    exit 0
}

# Trap per gestire Ctrl+C
trap cleanup SIGINT

# Mantieni lo script in esecuzione
wait
