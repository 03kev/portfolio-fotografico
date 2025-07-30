#!/bin/bash

# =====================================================================
# 🔍 Verifica Sistema Portfolio Fotografico
# =====================================================================
# Script per verificare che tutto sia configurato correttamente
# =====================================================================

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..50})${NC}"
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

# Funzione principale di verifica
main() {
    clear
    print_header "🔍 Verifica Sistema Portfolio Fotografico"
    
    echo ""
    print_info "Controllo versioni software..."
    
    # Controlla Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        print_success "Node.js: $node_version"
        
        # Verifica versione minima
        local version_number=$(echo $node_version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$version_number" -lt 16 ]; then
            print_warning "Versione Node.js < 16. Consigliata 18+"
        fi
    else
        print_error "Node.js NON INSTALLATO"
        echo "Scarica da: https://nodejs.org/"
    fi
    
    # Controlla NPM
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        print_success "NPM: v$npm_version"
    else
        print_error "NPM NON INSTALLATO"
    fi
    
    echo ""
    print_info "Controllo porte di sistema..."
    
    # Controlla porta 3000 (Frontend)
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        local pid=$(lsof -ti:3000)
        print_warning "Porta 3000 occupata (PID: $pid)"
    else
        print_success "Porta 3000 libera"
    fi
    
    # Controlla porta 5000 (Backend)  
    if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        local pid=$(lsof -ti:5000)
        print_warning "Porta 5000 occupata (PID: $pid)"
    else
        print_success "Porta 5000 libera"
    fi
    
    echo ""
    print_info "Controllo struttura progetto..."
    
    # File e cartelle essenziali
    local files_to_check=(
        "backend/package.json:Backend package.json"
        "frontend/package.json:Frontend package.json"
        "backend/.env:Backend configurazione"
        "frontend/.env:Frontend configurazione"
        "backend/data:Database directory"
        "backend/uploads:Upload directory"
        "backend/uploads/thumbnails:Thumbnails directory"
        "setup-automatico.sh:Script setup"
        "start-unix.sh:Script avvio Unix"
        "start-windows.bat:Script avvio Windows"
    )
    
    for item in "${files_to_check[@]}"; do
        local file=$(echo $item | cut -d':' -f1)
        local desc=$(echo $item | cut -d':' -f2)
        
        if [ -e "$file" ]; then
            print_success "$desc"
        else
            print_error "$desc MANCANTE ($file)"
        fi
    done
    
    echo ""
    print_info "Controllo dipendenze..."
    
    # Backend node_modules
    if [ -d "backend/node_modules" ] && [ "$(ls -A backend/node_modules)" ]; then
        print_success "Backend dipendenze installate"
        
        # Controlla se ci sono vulnerabilità
        cd backend
        local audit_result=$(npm audit --audit-level moderate 2>/dev/null | grep "found" || echo "0 vulnerabilities")
        if [[ $audit_result == *"0 vulnerabilities"* ]]; then
            print_success "Backend sicurezza OK"
        else
            print_warning "Backend: $audit_result"
        fi
        cd ..
    else
        print_error "Backend dipendenze MANCANTI"
        print_info "Eseguire: cd backend && npm install"
    fi
    
    # Frontend node_modules
    if [ -d "frontend/node_modules" ] && [ "$(ls -A frontend/node_modules)" ]; then
        print_success "Frontend dipendenze installate"
        
        # Controlla se ci sono vulnerabilità
        cd frontend
        local audit_result=$(npm audit --audit-level moderate 2>/dev/null | grep "found" || echo "0 vulnerabilities")
        if [[ $audit_result == *"0 vulnerabilities"* ]]; then
            print_success "Frontend sicurezza OK"
        else
            print_warning "Frontend: $audit_result"
        fi
        cd ..
    else
        print_error "Frontend dipendenze MANCANTI"
        print_info "Eseguire: cd frontend && npm install"
    fi
    
    echo ""
    print_info "Controllo database e contenuti..."
    
    # Database photos.json
    if [ -f "backend/data/photos.json" ]; then
        if [ -s "backend/data/photos.json" ]; then
            local photo_count=$(jq length backend/data/photos.json 2>/dev/null || echo "N/A")
            print_success "Database presente ($photo_count foto)"
        else
            print_warning "Database vuoto"
        fi
    else
        print_error "Database photos.json MANCANTE"
    fi
    
    # Spazio disco disponibile
    local available_space=$(df -h . | awk 'NR==2{print $4}')
    print_info "Spazio disco disponibile: $available_space"
    
    echo ""
    print_info "Controllo configurazioni..."
    
    # Verifica backend .env
    if [ -f "backend/.env" ]; then
        if grep -q "PORT=5000" backend/.env && grep -q "ALLOWED_ORIGINS" backend/.env; then
            print_success "Backend configurazione valida"
        else
            print_warning "Backend configurazione incompleta"
        fi
    fi
    
    # Verifica frontend .env
    if [ -f "frontend/.env" ]; then
        if grep -q "REACT_APP_API_URL" frontend/.env && grep -q "REACT_APP_IMAGES_URL" frontend/.env; then
            print_success "Frontend configurazione valida"
        else
            print_warning "Frontend configurazione incompleta"
        fi
    fi
    
    echo ""
    print_header "📊 Riepilogo Sistema"
    
    # Test connettività (se i servizi sono attivi)
    if curl -s "http://localhost:5000/api/health" >/dev/null 2>&1; then
        print_success "Backend API risponde"
    else
        print_info "Backend non attivo (normale se non avviato)"
    fi
    
    if curl -s "http://localhost:3000" >/dev/null 2>&1; then
        print_success "Frontend risponde"
    else
        print_info "Frontend non attivo (normale se non avviato)"
    fi
    
    echo ""
    print_header "🚀 Prossimi Passi"
    
    # Determina cosa fare in base alla situazione
    local needs_setup=false
    local needs_dependencies=false
    local ready_to_start=true
    
    if [ ! -f "backend/.env" ] || [ ! -f "frontend/.env" ]; then
        needs_setup=true
        ready_to_start=false
    fi
    
    if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
        needs_dependencies=true
        ready_to_start=false
    fi
    
    if [ "$needs_setup" = true ] || [ "$needs_dependencies" = true ]; then
        print_info "Setup necessario:"
        echo "   ${CYAN}./setup-automatico.sh${NC}"
        echo ""
    fi
    
    if [ "$ready_to_start" = true ]; then
        print_success "Sistema pronto per l'avvio!"
        echo ""
        print_info "Comandi disponibili:"
        echo "   ${CYAN}./start-unix.sh${NC}     - Avvia sistema (macOS/Linux)"
        echo "   ${CYAN}start-windows.bat${NC}  - Avvia sistema (Windows)"
        echo "   ${CYAN}./verify-system.sh${NC} - Ri-verifica sistema"
        echo ""
        print_info "URL di accesso:"
        echo "   Frontend: ${GREEN}http://localhost:3000${NC}"
        echo "   Backend:  ${GREEN}http://localhost:5000${NC}"
        echo "   API:      ${GREEN}http://localhost:5000/api${NC}"
    else
        print_warning "Configurazione incompleta"
        print_info "Esegui il setup automatico per risolvere i problemi"
    fi
    
    echo ""
    print_header "🔧 Comandi di Manutenzione"
    
    echo "   ${YELLOW}Pulizia cache:${NC}"
    echo "   cd backend && npm run clean"
    echo "   cd frontend && npm run clean"
    echo ""
    echo "   ${YELLOW}Aggiornamento dipendenze:${NC}"
    echo "   cd backend && npm update"
    echo "   cd frontend && npm update"
    echo ""
    echo "   ${YELLOW}Reset completo:${NC}"
    echo "   ./cleanup-backups.sh"
    echo "   rm -rf */node_modules"
    echo "   ./setup-automatico.sh"
    echo ""
    
    # Statistiche finali
    echo ""
    print_header "📈 Statistiche Sistema"
    
    local total_files=$(find . -type f | wc -l)
    local js_files=$(find . -name "*.js" -o -name "*.jsx" | wc -l)
    local css_files=$(find . -name "*.css" | wc -l)
    local json_files=$(find . -name "*.json" | wc -l)
    
    echo "   📁 File totali: $total_files"
    echo "   📄 File JavaScript: $js_files"
    echo "   🎨 File CSS: $css_files"
    echo "   ⚙️  File JSON: $json_files"
    
    if [ -d "backend/uploads" ]; then
        local uploaded_images=$(find backend/uploads -name "*.jpg" -o -name "*.png" -o -name "*.webp" 2>/dev/null | wc -l)
        echo "   🖼️  Immagini caricate: $uploaded_images"
    fi
    
    echo ""
    print_success "✨ Verifica completata!"
    
    # Suggerimenti finali
    echo ""
    print_info "💡 Suggerimenti:"
    echo "   - Esegui questa verifica dopo ogni aggiornamento"
    echo "   - Controlla i log se qualcosa non funziona"
    echo "   - Usa gli script interattivi per debugging"
    echo "   - Mantieni Node.js e npm aggiornati"
    echo ""
}

# Esegui main se lo script è chiamato direttamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
