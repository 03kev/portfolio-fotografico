#!/bin/bash

echo "🔐 Configurazione Permessi Script..."

chmod +x setup-automatico.sh
chmod +x start-unix.sh  
chmod +x cleanup-backups.sh

echo "✅ Permessi configurati per tutti gli script!"
echo ""
echo "📋 Script disponibili:"
echo "   ./setup-automatico.sh  - Setup completo del progetto"
echo "   ./start-unix.sh        - Avvio sistema (Unix/macOS/Linux)"
echo "   ./cleanup-backups.sh   - Pulizia file backup"
echo "   start-windows.bat      - Avvio sistema (Windows)"
