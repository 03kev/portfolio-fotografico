#!/bin/bash

# Script per testare l'upload
echo "🚀 Avviando test del sistema di upload..."

# Controllo se il backend è in esecuzione
echo "📡 Verificando se il backend è attivo..."
if curl -s http://localhost:5001/api/health > /dev/null; then
    echo "✅ Backend attivo!"
else
    echo "❌ Backend non attivo. Avvialo con:"
    echo "cd backend && npm run dev"
    exit 1
fi

# Controllo se il frontend è in esecuzione
echo "🌐 Verificando se il frontend è attivo..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend attivo!"
else
    echo "❌ Frontend non attivo. Avvialo con:"
    echo "cd frontend && npm start"
    exit 1
fi

echo "🎉 Sistema pronto per l'upload!"
echo "📸 Vai su http://localhost:3000 e clicca su 'Carica Foto'"
