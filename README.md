# Portfolio Fotografico

Applicazione full-stack per portfolio fotografico con frontend React, API Express su Vercel e storage Cloudflare R2.

## Stack

- Frontend: React (`frontend/`)
- Backend API: Express (`backend/`)
- Deploy: Vercel (static frontend + serverless API)
- Storage produzione: Cloudflare R2 (immagini + metadati JSON)
- Storage locale dev: filesystem (`backend/storage/`)

## Struttura progetto

```text
.
├── api/
│   └── index.js                    # Entrypoint serverless Vercel (usa backend/src/app.js)
├── backend/
│   ├── data/                       # Seed JSON locali (photos.json, series.json)
│   ├── scripts/
│   │   ├── sync-uploads-to-r2.js
│   │   └── sync-metadata-to-r2.js
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js               # Avvio locale
│   │   ├── config/
│   │   │   ├── defaults.js         # Default tecnici versionati
│   │   │   ├── env.js              # Parsing/validazione env
│   │   │   └── storage.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── photos.js
│   │   │   └── series.js
│   │   ├── services/
│   │   │   ├── metadataStorage.js
│   │   │   └── r2Storage.js
│   │   └── utils/
│   │       ├── ids.js
│   │       └── inputSanitizers.js
│   └── storage/                    # Runtime locale (ignorato da git)
│       ├── data/
│       └── uploads/
├── frontend/
│   ├── src/
│   └── .env.example
├── vercel.json
└── package.json
```

## Requisiti

- Node.js 18+
- npm 8+

## Avvio locale

1. Installa dipendenze:

```bash
npm run setup
```

2. Crea file env:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Avvia frontend + backend:

```bash
npm start
```

Servizi locali:
- Frontend: `http://localhost:3000`
- API backend: `http://localhost:5001`

## Configurazione ambiente

### Backend (`backend/.env`)

Variabili essenziali:

```env
PORT=5001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

API_WRITE_TOKEN_HASH=scrypt$16384$8$1$...
API_WRITE_TOKEN=
API_SESSION_SECRET=change_me_with_another_long_random_secret
API_SESSION_TTL_MS=604800000
API_AUTH_RATE_LIMIT_WINDOW_MS=600000
API_AUTH_RATE_LIMIT_MAX_ATTEMPTS=10

R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=portfolio-images
R2_PUBLIC_URL=https://uploads.yourdomain.com
R2_ENDPOINT=
R2_METADATA_PREFIX=data
```

Note:
- In produzione il backend è **R2-only**: senza credenziali R2 valide non parte.
- In produzione l'admin auth richiede **API_WRITE_TOKEN_HASH** (token mai in chiaro nelle env).
- I default tecnici (body limits, rate limit globale/write, upload defaults) sono in `backend/src/config/defaults.js`.
- Le env vengono parse/validate in `backend/src/config/env.js`.

### Frontend (`frontend/.env`)

```env
REACT_APP_SITE_URL=http://localhost:3000
REACT_APP_NAME=Portfolio Fotografico
REACT_APP_VERSION=1.0.0
```

Note:
- API e immagini usano fallback interni (`/api` e `''` in produzione, `localhost:5001` in sviluppo).
- `REACT_APP_SITE_URL` è opzionale e serve per canonical/OpenGraph assoluti.
- Non mettere segreti in variabili `REACT_APP_*`.

## Architettura storage

### Produzione

- Immagini: upload diretto Browser -> R2 tramite URL firmata (`POST /api/photos/upload-url`)
- Metadati (`photos.json`, `series.json`): su R2
- URL pubbliche asset servite da `R2_PUBLIC_URL` (es. `https://uploads.kevinmuka.dev`)

### Sviluppo locale

- Se R2 non è configurato, usa filesystem locale (`backend/storage`).
- Seed iniziali letti da `backend/data/`.

## Deploy su Vercel

### 1) Variabili su Vercel (Project Settings -> Environment Variables)

Minimo consigliato in Production:

- `API_WRITE_TOKEN_HASH`
- `API_SESSION_SECRET`
- `API_SESSION_TTL_MS` (se vuoi override)
- `API_AUTH_RATE_LIMIT_WINDOW_MS`
- `API_AUTH_RATE_LIMIT_MAX_ATTEMPTS`
- `CORS_ORIGINS` (es. `https://kevinmuka.dev,https://www.kevinmuka.dev`)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_URL` (es. `https://uploads.kevinmuka.dev`)
- opzionali: `R2_ENDPOINT`, `R2_METADATA_PREFIX`

Non necessario su Vercel:
- `PORT`
- `NODE_ENV` (gestita da Vercel)

Genera hash token admin:

```bash
cd backend
npm run token:hash -- "il-tuo-token-lungo-random"
```

Incolla l'output in `API_WRITE_TOKEN_HASH`.

### 2) Build/Deploy

Vercel usa:
- build frontend (`npm run vercel-build`)
- API serverless da `api/index.js`

### 3) Prima migrazione dati su R2 (se hai asset locali)

```bash
cd backend
npm run sync:r2
npm run sync:r2:metadata
```

## Dominio custom consigliato

Setup tipico:
- sito: `kevinmuka.dev` (+ redirect da `www`)
- asset R2: `uploads.kevinmuka.dev`

Checklist:
- DNS dominio principale puntato a Vercel
- dominio R2 custom attivo sul bucket
- `R2_PUBLIC_URL` aggiornato al dominio custom
- CORS R2 con origins del sito (`https://kevinmuka.dev`, `https://www.kevinmuka.dev`)
- `Public Development URL` R2 disattivato in produzione

## Sicurezza API

- Letture (`GET`) pubbliche.
- Scritture (`POST/PUT/DELETE`) protette da auth admin.
- Sessione admin via cookie `HttpOnly`:
  - login: `POST /api/auth/session` con `{ token }`
  - stato: `GET /api/auth/session`
  - logout: `DELETE /api/auth/session`
- In produzione l'autenticazione avviene via cookie sessione; header token (`Authorization`, `x-api-key`) disabilitati.
- Rate limit dedicato sul login auth (`/api/auth/session`).
- Sanitizzazione payload foto/serie lato backend.

## API principali

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`
- `GET /api/photos`
- `GET /api/photos/:id`
- `POST /api/photos/upload-url`
- `POST /api/photos`
- `PUT /api/photos/:id`
- `DELETE /api/photos/:id`
- `GET /api/series?all=false`
- `GET /api/series/:identifier`
- `POST /api/series`
- `PUT /api/series/:id`
- `DELETE /api/series/:id`

## Script utili

### Root

- `npm run setup` installa dipendenze backend/frontend
- `npm start` avvia backend + frontend in parallelo
- `npm run build` build frontend
- `npm run vercel-build` build usata da Vercel
- `npm run clean` pulizia `node_modules`

### Backend

- `npm run dev` avvio backend con nodemon
- `npm run sync:r2` sync upload locali -> R2
- `npm run sync:r2:metadata` sync metadati locali -> R2

## Troubleshooting rapido

### `EADDRINUSE` su porta backend locale

Chiudi il processo che usa la porta (`5001`) e riavvia.

### Upload fallisce con CORS

Controlla CORS policy bucket R2 (`PUT` + origins del sito).

### API in produzione non restituisce immagini

Verifica:
- `R2_PUBLIC_URL`
- dominio custom R2 attivo
- presenza oggetti nel bucket

## Note operative

- `backend/storage/` è runtime locale e non va versionato.
- Ruota periodicamente i segreti (`API_WRITE_TOKEN_HASH`, `API_SESSION_SECRET`, chiavi R2).
