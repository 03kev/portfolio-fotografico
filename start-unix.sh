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
