# Portfolio Fotografico

Portfolio fotografico full-stack con frontend React e backend Express.

## Panoramica

- Frontend: React (`frontend/`)
- Backend API: Express (`backend/`)
- Deploy: Vercel
- Storage produzione: Cloudflare R2 (immagini + metadata)
- Storage locale dev: filesystem (`backend/storage/`)

## Struttura progetto

```text
.
├── api/
│   └── index.js                 # Entrypoint serverless Vercel
├── backend/
│   ├── data/                    # JSON di riferimento (seed)
│   │   ├── photos.json
│   │   └── series.json
│   ├── scripts/
│   │   ├── sync-uploads-to-r2.js
│   │   └── sync-metadata-to-r2.js
│   ├── src/
│   │   ├── app.js
│   │   ├── config/storage.js
│   │   ├── routes/
│   │   │   ├── photos.js
│   │   │   └── series.js
│   │   └── services/
│   │       ├── r2Storage.js
│   │       └── metadataStorage.js
│   └── storage/                 # Runtime locale (ignorato da git)
│       ├── data/
│       └── uploads/
├── frontend/
│   ├── src/
│   └── .env.example
├── vercel.json
└── package.json
```

## Requisiti

- Node.js >= 16
- npm >= 8

Consigliato: Node.js 18+.

## Setup locale

1. Installa dipendenze:

```bash
npm run setup
```

2. Crea i file env:

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
- Backend API: `http://localhost:5001`

## Variabili ambiente

### Backend (`backend/.env`)

Minimo per sviluppo locale senza R2:

```env
PORT=5001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
# opzionale: protegge le API di scrittura
API_WRITE_TOKEN=<token-lungo-casuale>
```

Per usare R2 (obbligatorio in produzione):

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=https://<your-public-r2-url>
# opzionali
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_METADATA_PREFIX=data
```

### Frontend (`frontend/.env`)

```env
REACT_APP_API_URL=http://localhost:5001/api
```

## Storage: regole operative

- In `NODE_ENV=production`: backend **R2-only** (fallback locale disabilitato).
- In sviluppo: se R2 non è configurato, usa filesystem locale (`backend/storage`).
- I path delle immagini nei metadata restano in forma `/uploads/...` per compatibilità frontend.
- Upload immagini in produzione: diretto Browser -> R2 tramite URL firmata (`POST /api/photos/upload-url`), poi salvataggio metadata su `/api/photos`.

## Script principali

### Root

- `npm run setup` installa dipendenze backend + frontend
- `npm start` avvia backend + frontend in parallelo
- `npm run build` build frontend produzione
- `npm run vercel-build` build usata da Vercel
- `npm run test` test non interattivi (frontend) + placeholder backend
- `npm run lint` lint frontend + placeholder backend
- `npm run clean` rimuove `node_modules` backend/frontend

### Backend

- `npm run dev` avvio backend con nodemon
- `npm run sync:r2` sincronizza `backend/storage/uploads` (con fallback legacy `backend/uploads`) su R2
- `npm run sync:r2:metadata` sincronizza metadata JSON su R2

## Deploy su Vercel

### Architettura deploy

- Frontend statico: output `frontend/build`
- API serverless: `api/index.js` esporta `backend/src/app`
- Rewrites (`vercel.json`):
  - `/api/*` -> `/api`
  - `/uploads/*` -> `/api`
  - resto -> `/index.html`

### Checklist deploy

1. Imposta env su Vercel (Project Settings -> Environment Variables):
   - `NODE_ENV=production`
   - `API_WRITE_TOKEN`
   - `API_SESSION_SECRET` (consigliato)
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_URL` (consigliato)
   - opzionali: `R2_ENDPOINT`, `R2_METADATA_PREFIX`, `CORS_ORIGINS`
     - se `CORS_ORIGINS` non e` impostata, il backend accetta origin in fallback (consigliato impostarla comunque in produzione)

2. Esegui deploy.

3. (Prima migrazione) sincronizza dati esistenti su R2 da locale:

```bash
cd backend
npm run sync:r2
npm run sync:r2:metadata
```

## API essenziali

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`
- `GET /api/photos`
- `GET /api/photos/:id`
- `POST /api/photos`
- `PUT /api/photos/:id`
- `DELETE /api/photos/:id`
- `GET /api/series`
- `GET /api/series/:identifier`
- `POST /api/series`
- `PUT /api/series/:id`
- `DELETE /api/series/:id`

## Autenticazione API (scrittura)

- `GET` restano pubbliche.
- `POST/PUT/DELETE` richiedono autenticazione admin.
- Flusso frontend consigliato: sessione cookie `HttpOnly`.
  - login: `POST /api/auth/session` con body `{ token }`
  - stato: `GET /api/auth/session`
  - logout: `DELETE /api/auth/session`
- Header supportati:
  - `Authorization: Bearer <API_WRITE_TOKEN>`
  - `x-api-key: <API_WRITE_TOKEN>`
- In produzione `API_WRITE_TOKEN` è obbligatoria.
- Frontend:
  - abilita admin mode con `?admin=1`
  - usa il pulsante `API: OFF/ON` in header per aprire/chiudere la sessione admin

## Troubleshooting rapido

### Immagini non visibili in produzione

- Verifica `R2_PUBLIC_URL`
- Verifica bucket pubblico / policy accesso
- Verifica presenza oggetti su R2
- Verifica CORS del bucket R2 per upload browser (metodo `PUT` dal dominio del frontend)

### Backend non parte in produzione

- Controlla variabili R2: in produzione il backend è R2-only

### Test frontend resta in watch

- Usa `npm run test` da root (già configurato con `CI=true` e `--watchAll=false`)

## Note

- `backend/storage/` è runtime locale e non va versionata.
- `backend/data/` contiene i JSON di riferimento del progetto.
