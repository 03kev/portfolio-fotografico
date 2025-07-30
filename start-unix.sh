#!/bin/bash

# =====================================================================
# 🚀 Avvio Portfolio Fotografico
# =====================================================================
# Script per avviare contemporaneamente backend e frontend
# del Portfolio Fotografico con gestione avanzata dei processi
# =====================================================================

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variabili globali
BACKEND_PID=""
FRONTEND_PID=""
BACKEND_PORT=5000
FRONTEND_PORT=3000

# Funzioni di utilità
print_header() {
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..40})${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Controlla se le porte sono libere
check_ports() {
    local backend_in_use=false
    local frontend_in_use=false
    
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        backend_in_use=true
    fi
    
    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        frontend_in_use=true
    fi
    
    if [ "$backend_in_use" = true ] || [ "$frontend_in_use" = true ]; then
        print_warning "Alcune porte sono occupate:"
        [ "$backend_in_use" = true ] && echo "   🔴 Porta $BACKEND_PORT (Backend) occupata"
        [ "$frontend_in_use" = true ] && echo "   🔴 Porta $FRONTEND_PORT (Frontend) occupata"
        echo ""
        read -p "Vuoi terminare i processi esistenti? (y/N): " choice
        case "$choice" in
            y|Y|yes|Yes|YES)
                if [ "$backend_in_use" = true ]; then
                    print_info "Terminazione processi su porta $BACKEND_PORT..."
                    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null || true
                fi
                if [ "$frontend_in_use" = true ]; then
                    print_info "Terminazione processi su porta $FRONTEND_PORT..."
                    lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null || true
                fi
                sleep 2
                print_success "Porte liberate"
                ;;
            *)
                print_error "Impossibile avviare con porte occupate"
                exit 1
                ;;
        esac
    fi
}

# Controlla prerequisiti
check_prerequisites() {
    if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
        print_error "Cartelle backend o frontend non trovate"
        print_info "Assicurati di essere nella directory root del progetto"
        exit 1
    fi
    
    if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
        print_error "File package.json mancanti"
        print_info "Esegui prima: ./setup-automatico.sh"
        exit 1
    fi
    
    if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
        print_error "Dipendenze mancanti"
        print_info "Esegui prima: ./setup-automatico.sh"
        exit 1
    fi
}

# Avvia backend
start_backend() {
    print_info "Avvio Backend su porta $BACKEND_PORT..."
    
    cd backend
    npm run dev > ../backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..
    
    # Attendi che il backend sia pronto
    local count=0
    local max_attempts=30
    
    while [ $count -lt $max_attempts ]; do
        if curl -s "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
            print_success "Backend pronto su http://localhost:$BACKEND_PORT"
            return 0
        fi
        sleep 1
        count=$((count + 1))
        echo -n "."
    done
    
    print_error "Backend non risponde dopo ${max_attempts}s"
    print_info "Controlla il log: tail -f backend.log"
    return 1
}

# Avvia frontend
start_frontend() {
    print_info "Avvio Frontend su porta $FRONTEND_PORT..."
    
    cd frontend
    npm start > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..
    
    print_success "Frontend avviato (PID: $FRONTEND_PID)"
    print_info "Il frontend si aprirà automaticamente nel browser"
}

# Funzione di cleanup
cleanup() {
    echo ""
    print_info "🛑 Arresto servizi in corso..."
    
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null || true
        print_success "Backend fermato (PID: $BACKEND_PID)"
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_success "Frontend fermato (PID: $FRONTEND_PID)"
    fi
    
    # Cleanup aggressivo se necessario
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null || true
    lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null || true
    
    echo ""
    print_success "👋 Portfolio Fotografico fermato correttamente"
    exit 0
}

# Mostra status dei servizi
show_status() {
    echo ""
    print_header "📊 Status Servizi"
    
    # Backend status
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "📡 Backend:  ${GREEN}ATTIVO${NC} (PID: $BACKEND_PID, Porta: $BACKEND_PORT)"
    else
        echo -e "📡 Backend:  ${RED}INATTIVO${NC}"
    fi
    
    # Frontend status
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "🎨 Frontend: ${GREEN}ATTIVO${NC} (PID: $FRONTEND_PID, Porta: $FRONTEND_PORT)"
    else
        echo -e "🎨 Frontend: ${RED}INATTIVO${NC}"
    fi
    
    echo ""
    echo -e "🌐 URL di accesso:"
    echo -e "   Frontend: ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "   Backend:  ${CYAN}http://localhost:$BACKEND_PORT${NC}"
    echo -e "   API:      ${CYAN}http://localhost:$BACKEND_PORT/api${NC}"
}

# Mostra comandi disponibili
show_commands() {
    echo ""
    print_header "⌨️  Comandi Disponibili"
    echo "   ${YELLOW}s${NC} - Mostra status servizi"
    echo "   ${YELLOW}r${NC} - Riavvia entrambi i servizi"
    echo "   ${YELLOW}b${NC} - Riavvia solo backend"
    echo "   ${YELLOW}f${NC} - Riavvia solo frontend"
    echo "   ${YELLOW}l${NC} - Mostra log in tempo reale"
    echo "   ${YELLOW}o${NC} - Apri nel browser"
    echo "   ${YELLOW}h${NC} - Mostra questo aiuto"
    echo "   ${YELLOW}q${NC} - Termina applicazione"
    echo ""
}

# Apri nel browser
open_browser() {
    local url="http://localhost:$FRONTEND_PORT"
    print_info "Apertura $url nel browser..."
    
    if command -v open >/dev/null 2>&1; then
        # macOS
        open "$url"
    elif command -v xdg-open >/dev/null 2>&1; then
        # Linux
        xdg-open "$url"
    elif command -v start >/dev/null 2>&1; then
        # Windows
        start "$url"
    else
        print_warning "Impossibile aprire automaticamente il browser"
        echo "Apri manualmente: $url"
    fi
}

# Mostra log in tempo reale
show_logs() {
    echo ""
    print_info "Log in tempo reale (Ctrl+C per uscire)"
    echo "========================================"
    
    if [ -f "backend.log" ] && [ -f "frontend.log" ]; then
        tail -f backend.log frontend.log
    elif [ -f "backend.log" ]; then
        tail -f backend.log
    elif [ -f "frontend.log" ]; then
        tail -f frontend.log
    else
        print_warning "Nessun file di log trovato"
    fi
}

# Riavvia servizi
restart_services() {
    print_info "Riavvio servizi..."
    
    # Ferma servizi esistenti
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    sleep 3
    
    # Riavvia
    start_backend
    sleep 3
    start_frontend
    
    print_success "Servizi riavviati"
}

# Gestione comandi interattivi
handle_commands() {
    while true; do
        echo ""
        read -p "💬 Comando (h per aiuto): " cmd
        
        case "$cmd" in
            s|status)
                show_status
                ;;
            r|restart)
                restart_services
                ;;
            b|backend)
                print_info "Riavvio backend..."
                if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
                    kill $BACKEND_PID 2>/dev/null || true
                fi
                sleep 2
                start_backend
                ;;
            f|frontend)
                print_info "Riavvio frontend..."
                if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
                    kill $FRONTEND_PID 2>/dev/null || true
                fi
                sleep 2
                start_frontend
                ;;
            l|logs)
                show_logs
                ;;
            o|open)
                open_browser
                ;;
            h|help)
                show_commands
                ;;
            q|quit|exit)
                cleanup
                ;;
            "")
                # Comando vuoto, ignora
                ;;
            *)
                print_warning "Comando sconosciuto: $cmd"
                show_commands
                ;;
        esac
    done
}

# =====================================================================
# ESECUZIONE PRINCIPALE
# =====================================================================

main() {
    clear
    print_header "🚀 Portfolio Fotografico - Avvio Sistema"
    
    # Controlla prerequisiti
    check_prerequisites
    
    # Controlla porte
    check_ports
    
    echo ""
    print_info "Avvio servizi..."
    
    # Avvia backend
    if ! start_backend; then
        print_error "Impossibile avviare il backend"
        exit 1
    fi
    
    echo ""
    sleep 3
    
    # Avvia frontend
    start_frontend
    
    # Configura gestione segnali
    trap cleanup SIGINT SIGTERM
    
    # Mostra status finale
    show_status
    show_commands
    
    print_success "✨ Portfolio Fotografico avviato con successo!"
    print_info "💡 Premi Ctrl+C per fermare tutti i servizi"
    
    # Apri browser automaticamente
    sleep 2
    open_browser
    
    # Gestione comandi interattivi
    handle_commands
}

# Esegui main se lo script è chiamato direttamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
