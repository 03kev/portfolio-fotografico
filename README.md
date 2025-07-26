# Portfolio Fotografico

Un moderno portfolio fotografico con mappa interattiva del mondo, sviluppato con React e Node.js.

## 🌟 Caratteristiche

- **Mappa interattiva mondiale** con marker per ogni foto
- **Galleria fotografica moderna** con filtri avanzati
- **Design responsive** e mobile-first
- **Animazioni fluide** con Framer Motion
- **Modal dettagliata** per ogni foto con metadati EXIF
- **Backend RESTful API** per gestione foto
- **Upload e gestione immagini** con ottimizzazione automatica
- **Ricerca avanzata** per titolo, posizione e tag

## 🚀 Tech Stack

### Frontend
- **React 18** - Framework UI
- **Styled Components** - Styling CSS-in-JS
- **Framer Motion** - Animazioni
- **React Leaflet** - Mappa interattiva
- **React Router** - Routing
- **Axios** - HTTP client
- **React Intersection Observer** - Lazy loading

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Multer** - Upload file
- **Sharp** - Elaborazione immagini
- **Helmet** - Sicurezza
- **CORS** - Cross-origin requests
- **Rate Limiting** - Protezione API

## 🛠️ Installazione

### Prerequisiti
- Node.js 16+ 
- npm o yarn

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Configura le variabili d'ambiente in .env
npm run dev
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
# Configura le variabili d'ambiente in .env
npm start
```

## 🗂️ Struttura del Progetto

```
portfolio-fotografico/
├── backend/
│   ├── src/
│   │   ├── routes/         # Route API
│   │   ├── models/         # Modelli dati
│   │   ├── middleware/     # Middleware Express
│   │   └── server.js       # Server principale
│   ├── uploads/           # Cartella immagini
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Componenti React
│   │   ├── contexts/       # Context API
│   │   ├── styles/         # Stili globali
│   │   ├── utils/          # Utility e API
│   │   └── App.js
│   ├── public/
│   └── package.json
└── README.md
```

## 🎨 Componenti Principali

### Frontend
- **Header** - Navigazione responsive con menu mobile
- **Hero** - Sezione intro con animazioni particle
- **WorldMap** - Mappa interattiva con marker foto
- **Gallery** - Griglia foto con filtri e ricerca
- **PhotoModal** - Modal dettagliata con metadati
- **Footer** - Footer con contatti e social

### Backend
- **Photo Routes** - API per gestione foto
- **Photo Model** - Modello dati foto
- **Upload Middleware** - Gestione upload immagini

## 🔧 Configurazione

### Variabili d'Ambiente Backend (.env)
```
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
MAX_FILE_SIZE=10485760
```

### Variabili d'Ambiente Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_APP_NAME=Portfolio Fotografico
```

## 📸 Utilizzo

1. **Avvia il backend**: `cd backend && npm run dev`
2. **Avvia il frontend**: `cd frontend && npm start`
3. **Apri** http://localhost:3000 nel browser
4. **Esplora** la mappa cliccando sui marker
5. **Naviga** nella galleria con filtri
6. **Visualizza** i dettagli nelle modal

## 🌍 Funzionalità Mappa

- **Marker personalizzati** per ogni foto
- **Popup interattivi** con anteprima
- **Zoom e pan** fluidi
- **Tema scuro** ottimizzato
- **Statistiche** viaggi in tempo reale

## 🖼️ Gestione Foto

- **Upload multiplo** con drag & drop
- **Ottimizzazione automatica** (Sharp)
- **Thumbnail** generate automaticamente
- **Metadati EXIF** estratti
- **Geolocalizzazione** automatica

## 📱 Responsive Design

- **Mobile-first** approach
- **Breakpoint** ottimizzati
- **Touch gestures** per mobile
- **Menu hamburger** su mobile
- **Grid adattiva** per ogni schermo

## 🎭 Animazioni

- **Scroll-triggered** animations
- **Hover effects** fluidi
- **Page transitions** smooth
- **Loading states** animate
- **Micro-interactions** curate

## 🔒 Sicurezza

- **Helmet** per headers sicuri
- **Rate limiting** su API
- **Validazione** input
- **Sanitizzazione** file upload
- **CORS** configurato

## 🚀 Deploy

### Frontend (Netlify/Vercel)
```bash
cd frontend
npm run build
# Upload cartella build/
```

### Backend (Heroku/Railway)
```bash
cd backend
# Configura variabili d'ambiente
# Deploy su piattaforma scelta
```

## 🤝 Contributi

1. Fork del progetto
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit modifiche (`git commit -m 'Add AmazingFeature'`)
4. Push branch (`git push origin feature/AmazingFeature`)
5. Apri Pull Request

## 📄 Licenza

Questo progetto è sotto licenza MIT. Vedi `LICENSE` per dettagli.

## 👨‍💻 Autore

**Kevin** - Portfolio Fotografico

## 🙏 Ringraziamenti

- **Unsplash** per le immagini demo
- **Leaflet** per la mappa
- **React Community** per i tool
- **OpenStreetMap** per i dati mappa
