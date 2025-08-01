#!/bin/bash

echo "🔐 Configurazione Permessi Script Finali..."
echo "============================================="

scripts=(
    "setup-automatico.sh"
    "start-unix.sh"
    "verify-system.sh"
    "cleanup-backups.sh"
    "make-scripts-executable.sh"
)

for script in "${scripts[@]}"; do
    if [ -f "$script" ]; then
        chmod +x "$script"
        echo "✅ $script"
    else
        echo "⚠️  $script (non trovato)"
    fi
done

echo ""
echo "🎉 Configurazione completata!"
echo ""
echo "📋 Script disponibili:"
echo "   ./setup-automatico.sh     - Setup completo del progetto"
echo "   ./start-unix.sh           - Avvio sistema (Unix/macOS/Linux)"
echo "   ./verify-system.sh        - Verifica configurazione sistema"
echo "   ./cleanup-backups.sh      - Pulizia file backup"
echo "   start-windows.bat         - Avvio sistema (Windows)"
echo ""
echo "🚀 Prossimo passo:"
echo "   ./setup-automatico.sh"
