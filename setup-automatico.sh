#!/bin/bash

# =====================================================================
# 🚀 Setup Automatico Portfolio Fotografico
# =====================================================================
# Questo script configura automaticamente tutto il necessario per
# eseguire il Portfolio Fotografico, incluse dipendenze, configurazioni
# e file di esempio.
# =====================================================================

set -e  # Termina script in caso di errore

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funzioni di utilità
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

# Controlla prerequisiti
check_prerequisites() {
    print_header "🔍 Controllo Prerequisiti"
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js non è installato"
        echo "Scarica Node.js da: https://nodejs.org/"
        echo "Versione consigliata: Node.js 18.x o superiore"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "NPM non è installato"
        exit 1
    fi

    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 16 ]; then
        print_warning "Node.js versione $node_version rilevata. Consigliata versione 18+"
    fi

    print_success "Node.js: $(node --version)"
    print_success "NPM: $(npm --version)"
}

# Installa dipendenze
install_dependencies() {
    print_header "📦 Installazione Dipendenze"
    
    # Backend
    echo -e "\n${PURPLE}📡 Backend Dependencies${NC}"
    cd backend
    if [ ! -d "node_modules" ]; then
        npm install
        if [ $? -eq 0 ]; then
            print_success "Dipendenze backend installate"
        else
            print_error "Errore installazione dipendenze backend"
            exit 1
        fi
    else
        print_info "Dipendenze backend già installate"
        # Controllo per aggiornamenti
        if npm outdated | grep -q .; then
            print_warning "Dipendenze backend non aggiornate. Eseguire 'npm update' se necessario"
        fi
    fi
    cd ..

    # Frontend
    echo -e "\n${PURPLE}🎨 Frontend Dependencies${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
        if [ $? -eq 0 ]; then
            print_success "Dipendenze frontend installate"
        else
            print_error "Errore installazione dipendenze frontend"
            exit 1
        fi
    else
        print_info "Dipendenze frontend già installate"
        # Controllo per aggiornamenti
        if npm outdated | grep -q .; then
            print_warning "Dipendenze frontend non aggiornate. Eseguire 'npm update' se necessario"
        fi
    fi
    cd ..
}

# Crea cartelle necessarie
create_directories() {
    print_header "📁 Creazione Cartelle Sistema"
    
    directories=(
        "backend/uploads"
        "backend/uploads/thumbnails"
        "backend/data"
        "backend/logs"
    )
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_success "Creata cartella: $dir"
        else
            print_info "Cartella già esistente: $dir"
        fi
    done
}

# Configura file .env
setup_env_files() {
    print_header "⚙️  Configurazione File Ambiente"
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        print_info "Creazione backend/.env..."
        cat > backend/.env << 'EOF'
# ==============================================
# 🚀 Portfolio Fotografico - Backend Config
# ==============================================

# Server Configuration
PORT=5000
NODE_ENV=development
HOST=localhost

# Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
ALLOWED_FORMATS=jpg,jpeg,png,webp
MAX_UPLOAD_FILES=10

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Image Processing
ENABLE_WEBP_CONVERSION=true
THUMBNAIL_SIZE=300
IMAGE_QUALITY=85

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Security (Uncomment when needed)
# RATE_LIMIT_WINDOW=900000
# RATE_LIMIT_MAX=1000

# Database (Per future espansioni)
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=portfolio
# DB_USER=portfolio_user
# DB_PASS=portfolio_pass

# JWT Secret (Per future autenticazioni)
# JWT_SECRET=your_super_secret_key_here_change_in_production

# External Services (Per future integrazioni)
# CLOUDINARY_CLOUD_NAME=your_cloud_name
# CLOUDINARY_API_KEY=your_api_key
# CLOUDINARY_API_SECRET=your_api_secret
# GOOGLE_MAPS_API_KEY=your_google_maps_key
# SENTRY_DSN=your_sentry_dsn
EOF
        print_success "File backend/.env creato"
    else
        print_info "File backend/.env già presente"
    fi

    # Frontend .env
    if [ ! -f "frontend/.env" ]; then
        print_info "Creazione frontend/.env..."
        cat > frontend/.env << 'EOF'
# ==============================================
# 🎨 Portfolio Fotografico - Frontend Config
# ==============================================

# API Configuration
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_IMAGES_URL=http://localhost:5000
REACT_APP_API_TIMEOUT=10000

# App Metadata
REACT_APP_NAME=Portfolio Fotografico
REACT_APP_VERSION=2.0.0
REACT_APP_DESCRIPTION=Portfolio fotografico con mappa interattiva
REACT_APP_AUTHOR=Il Tuo Nome

# Development Settings
REACT_APP_DEBUG=true
GENERATE_SOURCEMAP=true
REACT_APP_LOG_LEVEL=info

# Performance Settings
REACT_APP_ENABLE_COMPRESSION=true
REACT_APP_LAZY_LOADING=true
REACT_APP_ENABLE_SERVICE_WORKER=false

# Feature Flags
REACT_APP_ENABLE_OFFLINE_MODE=false
REACT_APP_ENABLE_PWA=false
REACT_APP_ENABLE_ANALYTICS=false

# External Services (Uncomment when configured)
# REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
# REACT_APP_ANALYTICS_ID=your_analytics_id
# REACT_APP_SENTRY_DSN=your_sentry_dsn
# REACT_APP_CLOUDINARY_CLOUD_NAME=your_cloud_name

# Social Media (Per future integrazioni)
# REACT_APP_FACEBOOK_APP_ID=your_facebook_app_id
# REACT_APP_TWITTER_HANDLE=@your_twitter
# REACT_APP_INSTAGRAM_HANDLE=your_instagram
EOF
        print_success "File frontend/.env creato"
    else
        print_info "File frontend/.env già presente"
    fi
}

# Inizializza database con dati di esempio
setup_database() {
    print_header "🗄️  Inizializzazione Database"
    
    if [ ! -f "backend/data/photos.json" ] || [ ! -s "backend/data/photos.json" ]; then
        print_info "Creazione database con dati di esempio..."
        cat > backend/data/photos.json << 'EOF'
[
  {
    "id": 1,
    "title": "Benvenuto nel tuo Portfolio!",
    "location": "Bologna, Emilia-Romagna, Italia",
    "lat": 44.4949,
    "lng": 11.3426,
    "image": "/uploads/welcome.jpg",
    "thumbnail": "/uploads/thumbnails/welcome_thumb.jpg",
    "description": "Questa è una foto di esempio per iniziare a esplorare il tuo nuovo portfolio fotografico! Puoi eliminarla e caricare le tue opere. Il sistema supporta upload, geolocalizzazione, metadati EXIF e molto altro.",
    "date": "2025-01-30",
    "camera": "Portfolio Camera System",
    "lens": "Example Lens 24-70mm",
    "settings": {
      "aperture": "f/5.6",
      "shutter": "1/125s",
      "iso": "200",
      "focal": "35mm"
    },
    "tags": ["welcome", "esempio", "portfolio", "bologna", "test"],
    "uploadDate": "2025-01-30T10:00:00.000Z",
    "size": 1024000,
    "dimensions": {
      "width": 1920,
      "height": 1080
    }
  }
]
EOF
        print_success "Database inizializzato con foto di benvenuto"
    else
        print_info "Database già presente e popolato"
    fi
    
    # Backup automatico se il database è pieno
    if [ -f "backend/data/photos.json" ] && [ -s "backend/data/photos.json" ]; then
        local backup_file="backend/data/photos_backup_$(date +%Y%m%d_%H%M%S).json"
        cp "backend/data/photos.json" "$backup_file"
        print_info "Backup automatico creato: $backup_file"
    fi
}

# Crea script di utilità
create_utility_scripts() {
    print_header "🛠️  Creazione Script Utilità"
    
    # Script di verifica sistema
    if [ ! -f "verify-system.sh" ]; then
        cat > verify-system.sh << 'EOF'
#!/bin/bash

echo "🔍 Verifica Sistema Portfolio Fotografico"
echo "=========================================="

# Controlla Node.js e npm
echo -e "\n📋 Versioni Software:"
echo "Node.js: $(node --version 2>/dev/null || echo 'NON INSTALLATO')"
echo "NPM: $(npm --version 2>/dev/null || echo 'NON INSTALLATO')"

# Controlla porte
echo -e "\n🌐 Controllo Porte:"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Porta 3000 occupata"
else
    echo "✅ Porta 3000 libera"
fi

if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Porta 5000 occupata"
else
    echo "✅ Porta 5000 libera"
fi

# Controlla file e cartelle
echo -e "\n📁 Struttura Progetto:"
files_to_check=(
    "backend/package.json"
    "frontend/package.json"
    "backend/.env"
    "frontend/.env"
    "backend/data/photos.json"
    "backend/uploads"
)

for file in "${files_to_check[@]}"; do
    if [ -e "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file (mancante)"
    fi
done

# Controlla dipendenze
echo -e "\n📦 Dipendenze:"
if [ -d "backend/node_modules" ]; then
    echo "✅ Backend node_modules"
else
    echo "❌ Backend node_modules (eseguire npm install)"
fi

if [ -d "frontend/node_modules" ]; then
    echo "✅ Frontend node_modules"
else
    echo "❌ Frontend node_modules (eseguire npm install)"
fi

echo -e "\n🚀 Per avviare:"
echo "   ./start-unix.sh (macOS/Linux)"
echo "   start-windows.bat (Windows)"
EOF
        chmod +x verify-system.sh
        print_success "Creato: verify-system.sh"
    fi
}

# Rende eseguibili gli script di avvio
make_scripts_executable() {
    print_header "🔐 Configurazione Permessi Script"
    
    scripts=(
        "setup-automatico.sh"
        "start-unix.sh"
        "verify-system.sh"
        "cleanup-backups.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            chmod +x "$script"
            print_success "Reso eseguibile: $script"
        fi
    done
}

# Riepilogo finale
print_final_summary() {
    print_header "🎉 Setup Completato!"
    
    echo -e "\n${GREEN}📋 Configurazione Completata:${NC}"
    echo "   ✅ Dipendenze backend e frontend installate"
    echo "   ✅ File di configurazione .env creati"
    echo "   ✅ Cartelle di sistema create"
    echo "   ✅ Database inizializzato"
    echo "   ✅ Script di utilità generati"
    echo "   ✅ Permessi configurati"
    
    echo -e "\n${BLUE}🚀 Prossimi Passi:${NC}"
    echo "1. Avvia il sistema:"
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo "   ${CYAN}start-windows.bat${NC} (doppio click)"
    else
        echo "   ${CYAN}./start-unix.sh${NC}"
    fi
    
    echo -e "\n2. Apri il browser:"
    echo "   ${CYAN}http://localhost:3000${NC}"
    
    echo -e "\n3. Verifica sistema (opzionale):"
    echo "   ${CYAN}./verify-system.sh${NC}"
    
    echo -e "\n${YELLOW}🔧 Comandi Utili:${NC}"
    echo "   ${CYAN}./cleanup-backups.sh${NC}     - Pulisce file backup"
    echo "   ${CYAN}./verify-system.sh${NC}       - Verifica configurazione"
    
    echo -e "\n${PURPLE}📡 URL di Accesso:${NC}"
    echo "   Frontend: ${GREEN}http://localhost:3000${NC}"
    echo "   Backend:  ${GREEN}http://localhost:5000${NC}"
    echo "   API:      ${GREEN}http://localhost:5000/api${NC}"
    
    echo -e "\n${CYAN}✨ Buon lavoro con il tuo Portfolio Fotografico! ✨${NC}"
}

# =====================================================================
# ESECUZIONE PRINCIPALE
# =====================================================================

main() {
    clear
    print_header "🚀 Setup Automatico Portfolio Fotografico v2.0"
    
    check_prerequisites
    echo ""
    
    install_dependencies
    echo ""
    
    create_directories
    echo ""
    
    setup_env_files
    echo ""
    
    setup_database
    echo ""
    
    create_utility_scripts
    echo ""
    
    make_scripts_executable
    echo ""
    
    print_final_summary
}

# Esegui main se lo script è chiamato direttamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
