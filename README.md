# 📸 Portfolio Fotografico

Un'applicazione web moderna per gestire e visualizzare il tuo portfolio fotografico con mappa interattiva, galleria responsiva e sistema di upload avanzato.

![Portfolio Preview](https://img.shields.io/badge/Status-Ready%20to%20Use-brightgreen)
![React](https://img.shields.io/badge/React-18+-blue)
![Node.js](https://img.shields.io/badge/Node.js-16+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Caratteristiche Principali

### 🎨 **Frontend Moderno**
- **React 18** con Hooks e Context API
- **Styled Components** per styling modulare
- **Framer Motion** per animazioni fluide
- **Responsive Design** ottimizzato per tutti i dispositivi
- **Leaflet Maps** per visualizzazione geografica interattiva

### 🔧 **Backend Robusto**
- **Node.js & Express** per API RESTful
- **Multer & Sharp** per elaborazione immagini
- **WebP** conversion per ottimizzazione automatica
- **JSON Database** per persistenza semplice
- **Error Handling** avanzato

### 📱 **User Experience**
- **Drag & Drop** upload (pianificato)
- **Real-time** aggiornamenti
- **Toast Notifications** per feedback immediato
- **Modal Gallery** con navigazione fluida
- **Search & Filter** avanzati
- **Mobile-First** design approach

## 🚀 Setup Rapido

### Opzione 1: Setup Automatico (Consigliato)
```bash
# Rendi eseguibile lo script
chmod +x setup-automatico.sh

# Esegui il setup
./setup-automatico.sh

# Avvia l'applicazione
./start-unix.sh    # macOS/Linux
# OPPURE
start-windows.bat  # Windows
```

### Opzione 2: Setup Manuale
```bash
# 1. Installa dipendenze backend
cd backend
npm install

# 2. Installa dipendenze frontend
cd ../frontend
npm install

# 3. Crea file di configurazione
cp .env.example .env
cd ../backend
cp .env.example .env

# 4. Avvia backend (Terminal 1)
cd backend
npm run dev

# 5. Avvia frontend (Terminal 2)
cd frontend
npm start
```

## 🔧 Problemi Risolti (Versione Corrente)

### ✅ **Correzioni Implementate**
1. **Foto Reali in Galleria**: Ora mostra le foto caricate, non placeholder
2. **Marker Mappa Stabili**: Fix comportamento click sui pin geografici  
3. **Form Completamente Responsive**: Ottimizzato per mobile/tablet/desktop
4. **Galleria Auto-Aggiornamento**: Le foto appaiono immediatamente dopo upload
5. **Sistema Notifiche**: Toast per feedback utente in tempo reale
6. **Configurazione Centralizzata**: URL e costanti in file dedicato

### 🛠️ **File Modificati**
- `frontend/src/components/Gallery.js` - Immagini reali + constants
- `frontend/src/components/WorldMap.js` - Fix marker + immagini reali
- `frontend/src/components/PhotoModal.js` - Modal con immagini reali
- `frontend/src/components/PhotoUpload.css` - Responsive migliorato
- `frontend/src/contexts/PhotoContext.js` - Fix refresh galleria
- `frontend/src/utils/constants.js` - **✨ Nuovo**: Configurazione centralizzata
- `frontend/src/components/Toast.js` - **✨ Nuovo**: Sistema notifiche

## 📁 Struttura Progetto

```
portfolio-fotografico/
├── frontend/                    # React App
│   ├── public/
│   ├── src/
│   │   ├── components/         # Componenti React
│   │   │   ├── Gallery.js     # Galleria foto
│   │   │   ├── WorldMap.js    # Mappa interattiva
│   │   │   ├── PhotoUpload.js # Form upload
│   │   │   ├── PhotoModal.js  # Modal visualizzazione
│   │   │   └── Toast.js       # Notifiche
│   │   ├── contexts/          # React Context
│   │   ├── utils/             # Utilità e API
│   │   └── styles/            # Stili globali
│   ├── .env                   # Configurazione frontend
│   └── package.json
├── backend/                    # Node.js API
│   ├── src/
│   │   ├── routes/           # Route API
│   │   ├── middleware/       # Middleware Express
│   │   └── models/           # Modelli dati
│   ├── uploads/              # Immagini caricate
│   │   └── thumbnails/       # Thumbnails generate
│   ├── data/                 # Database JSON
│   ├── .env                  # Configurazione backend
│   └── package.json
├── setup-automatico.sh        # Script setup
├── verifica-sistema.sh        # Script verifica
├── start-unix.sh             # Avvio rapido Unix
├── start-windows.bat         # Avvio rapido Windows
└── CORREZIONI_APPLICATE.md   # Documentazione fix
```

## 🔧 Configurazione

### Backend (.env)
```env
PORT=5000
NODE_ENV=development
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_IMAGES_URL=http://localhost:5000
REACT_APP_NAME=Portfolio Fotografico
```

## 📖 API Endpoints

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/api/photos` | Lista tutte le foto |
| GET | `/api/photos/:id` | Dettagli foto specifica |
| POST | `/api/photos` | Carica nuova foto |
| DELETE | `/api/photos/:id` | Elimina foto |
| GET | `/api/health` | Stato API |

## 🧪 Testing & Debug

### Script di Verifica
```bash
# Controlla stato completo del sistema
./verifica-sistema.sh
```

### Debug Manuale
```bash
# Test API backend
curl -X GET http://localhost:5000/api/photos
curl -X GET http://localhost:5000/api/health

# Controlla file caricati
ls -la backend/uploads/
ls -la backend/uploads/thumbnails/

# Verifica database
cat backend/data/photos.json | jq .
```

### Console Browser
- **F12** > Console per errori JavaScript
- **F12** > Network per monitoring richieste API
- **F12** > Application > Local Storage per dati locali

## 🎯 Roadmap Futuri Sviluppi

### 🔄 **In Sviluppo**
- [ ] Batch upload multiple foto
- [ ] Estrazione metadati EXIF automatica
- [ ] Compressione immagini lato client
- [ ] Drag & Drop interface

### 🚀 **Pianificati**
- [ ] Autenticazione utenti
- [ ] Database PostgreSQL/MongoDB
- [ ] Cloud storage (Cloudinary/AWS S3)
- [ ] PWA support
- [ ] Social sharing
- [ ] Watermark automatico
- [ ] Backup automatico
- [ ] Analytics foto
- [ ] Export portfolio PDF

### 🔧 **Miglioramenti Tecnici**
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Unit & Integration tests
- [ ] Performance monitoring
- [ ] SEO optimization
- [ ] Lazy loading immagini
- [ ] Service Worker per offline
- [ ] WebP/AVIF support avanzato

## 🐛 Troubleshooting

### Problemi Comuni

**❌ Porto 3000/5000 già in uso**
```bash
# Trova processo
lsof -ti:3000
lsof -ti:5000

# Termina processo
kill -9 $(lsof -ti:3000)
```

**❌ Errori CORS**
- Verifica `ALLOWED_ORIGINS` in backend/.env
- Controlla che frontend sia su `http://localhost:3000`

**❌ Immagini non si caricano**
- Controlla permessi cartella `backend/uploads`
- Verifica `REACT_APP_IMAGES_URL` in frontend/.env
- Ispeziona Network tab nel browser

**❌ Database corrotto**
```bash
# Backup e reset
cp backend/data/photos.json backend/data/photos.json.backup
echo "[]" > backend/data/photos.json
```

## 📄 License

Distribuito sotto licenza MIT. Vedi `LICENSE` per maggiori informazioni.

## 🤝 Contributi

I contributi sono benvenuti! Per contribuire:

1. Fork del progetto
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push del branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📞 Supporto

Per supporto e domande:
- 📧 Email: [Il tuo email]
- 🐛 Issues: [GitHub Issues]
- 📖 Wiki: [GitHub Wiki]

## 🎉 Ringraziamenti

- **React Team** per il framework
- **Leaflet** per le mappe
- **Unsplash** per le immagini placeholder
- **Framer Motion** per le animazioni
- **Sharp** per l'elaborazione immagini

---

<div align="center">

**✨ Fatto con ❤️ per i fotografi digitali ✨**

[⭐ Stella il repo](../../stargazers) • [🐛 Reporta bug](../../issues) • [💡 Richiedi feature](../../issues)

</div>
