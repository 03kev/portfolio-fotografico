#!/bin/bash

# Script di verifica per il Portfolio Fotografico
# Rende eseguibile: chmod +x verifica-sistema.sh
# Esegui con: ./verifica-sistema.sh

echo "🔍 Verifica Stato Portfolio Fotografico"
echo "========================================"

# Controlla se Node.js è installato
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non è installato"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ NPM: $(npm --version)"

# Verifica struttura progetto
echo -e "\n📁 Struttura Progetto:"
if [ -d "frontend" ] && [ -d "backend" ]; then
    echo "✅ Cartelle frontend e backend presenti"
else
    echo "❌ Struttura progetto non corretta"
    exit 1
fi

# Verifica file di configurazione
echo -e "\n⚙️ Configurazioni:"

if [ -f "frontend/.env" ]; then
    echo "✅ File .env frontend presente"
    echo "   API URL: $(grep REACT_APP_API_URL frontend/.env | cut -d'=' -f2)"
else
    echo "⚠️ File .env frontend mancante"
fi

if [ -f "backend/.env" ]; then
    echo "✅ File .env backend presente"
else
    echo "⚠️ File .env backend mancante"
fi

# Verifica dipendenze
echo -e "\n📦 Dipendenze:"

cd frontend
if [ -d "node_modules" ]; then
    echo "✅ Dipendenze frontend installate"
else
    echo "⚠️ Esegui 'npm install' in frontend/"
fi
cd ..

cd backend
if [ -d "node_modules" ]; then
    echo "✅ Dipendenze backend installate"
else
    echo "⚠️ Esegui 'npm install' in backend/"
fi
cd ..

# Verifica cartelle upload
echo -e "\n📸 Sistema Upload:"
if [ -d "backend/uploads" ]; then
    echo "✅ Cartella uploads presente"
    photo_count=$(find backend/uploads -name "*.webp" 2>/dev/null | wc -l)
    echo "   Foto caricate: $photo_count"
else
    echo "⚠️ Cartella uploads non presente (verrà creata automaticamente)"
fi

if [ -d "backend/uploads/thumbnails" ]; then
    echo "✅ Cartella thumbnails presente"
    thumb_count=$(find backend/uploads/thumbnails -name "*_thumb.webp" 2>/dev/null | wc -l)
    echo "   Thumbnails: $thumb_count"
else
    echo "⚠️ Cartella thumbnails non presente (verrà creata automaticamente)"
fi

# Verifica database
echo -e "\n🗄️ Database:"
if [ -f "backend/data/photos.json" ]; then
    echo "✅ Database photos.json presente"
    if command -v jq &> /dev/null; then
        record_count=$(jq length backend/data/photos.json 2>/dev/null || echo "?")
        echo "   Record nel database: $record_count"
    fi
else
    echo "⚠️ Database photos.json non presente (verrà creato automaticamente)"
fi

# Test connettività API (se il server è in esecuzione)
echo -e "\n🌐 Test Connettività:"
if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Backend API raggiungibile su http://localhost:5000"
    
    # Test endpoint foto
    if curl -s http://localhost:5000/api/photos > /dev/null 2>&1; then
        echo "✅ Endpoint /api/photos funzionante"
    else
        echo "⚠️ Endpoint /api/photos non risponde"
    fi
else
    echo "⚠️ Backend non in esecuzione su porta 5000"
    echo "   Avvia con: cd backend && npm run dev"
fi

# Verifica file modificati dalle correzioni
echo -e "\n🔧 File Corretti:"
files_to_check=(
    "frontend/src/components/Gallery.js"
    "frontend/src/components/WorldMap.js"
    "frontend/src/components/PhotoModal.js"
    "frontend/src/components/PhotoUpload.css"
    "frontend/src/contexts/PhotoContext.js"
    "frontend/src/utils/constants.js"
    "frontend/src/components/Toast.js"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file mancante"
    fi
done

# Comandi suggeriti
echo -e "\n🚀 Comandi per Avviare:"
echo "1. Backend:  cd backend && npm run dev"
echo "2. Frontend: cd frontend && npm start"
echo "3. Apri:     http://localhost:3000"

echo -e "\n📊 Test Raccomandati:"
echo "1. Carica una foto dal form"
echo "2. Verifica che appaia nella galleria"
echo "3. Clicca sui pin sulla mappa"
echo "4. Testa il responsive design"
echo "5. Controlla le notifiche toast"

echo -e "\n✨ Verifica completata!"
