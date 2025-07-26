#!/bin/bash

# Script per configurare permessi - Portfolio Fotografico
# Esegui con: bash configura-permessi.sh

echo "🔐 Configurazione Permessi Portfolio Fotografico"
echo "================================================"

# Rendi eseguibili tutti gli script
chmod +x setup-automatico.sh
chmod +x verifica-sistema.sh
chmod +x start-unix.sh

# Crea il file start-unix.sh se non esiste
if [ ! -f "start-unix.sh" ]; then
    echo "📝 Creazione start-unix.sh..."
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
fi

echo "✅ Permessi configurati per:"
echo "   📦 setup-automatico.sh"
echo "   🔍 verifica-sistema.sh"  
echo "   🚀 start-unix.sh"

echo ""
echo "🎯 Prossimi passi:"
echo "1. Esegui setup: ./setup-automatico.sh"
echo "2. Verifica sistema: ./verifica-sistema.sh"
echo "3. Avvia portfolio: ./start-unix.sh"

echo ""
echo "💡 Oppure usa i comandi manuali:"
echo "   Backend:  cd backend && npm run dev"
echo "   Frontend: cd frontend && npm start"
