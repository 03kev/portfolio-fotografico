# Kevin Muka | Portfolio Fotografico

Portfolio fotografico full-stack con frontend React, API Express su Vercel e storage Cloudflare R2 per immagini e metadati.

## Panoramica

- Frontend SPA: React (`frontend/`)
- Backend API: Express (`backend/`)
- Deploy: Vercel (frontend statico + funzioni serverless)
- Storage produzione: Cloudflare R2 (`uploads` + metadati JSON)
- Storage locale sviluppo: filesystem (`backend/storage/`)

## Funzionalita principali

- Gestione foto (upload, modifica, eliminazione)
- Gestione serie (layout, ordine, pubblicazione)
- Mappa interattiva e archivio filtrabile
- Modalita admin con sessione cookie HttpOnly
- SEO base: canonical, OpenGraph, JSON-LD, sitemap immagini API

## Struttura progetto

```text
.
├── api/
│   └── index.js                       # Entrypoint Vercel -> backend/src/app.js
├── backend/
│   ├── scripts/
│   │   ├── hash-write-token.js
│   │   ├── backfill-private-sources.js
│   │   ├── backfill-public-derivatives.js
│   │   ├── sync-uploads-to-r2.js
│   │   └── sync-metadata-to-r2.js
│   ├── src/
│   │   ├── app.js                     # App Express condivisa (locale + serverless)
│   │   ├── server.js                  # Avvio backend locale
│   │   ├── config/
│   │   │   ├── defaults.js
│   │   │   ├── env.js
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
│   └── storage/                       # Runtime locale (gitignored)
│       ├── data/
│       └── uploads/
├── frontend/
│   ├── public/
│   └── src/
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

2. Crea i file env:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Avvia backend + frontend:

```bash
npm start
```

Servizi locali:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5001`

## Configurazione ambiente

### Backend (`backend/.env`)

Variabili principali:

```env
# Runtime locale
PORT=5001
NODE_ENV=development
SITE_URL=http://localhost:3000

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Admin auth
API_WRITE_TOKEN_HASH=scrypt$16384$8$1$...
API_WRITE_TOKEN=
API_SESSION_SECRET=replace_with_long_random_secret
API_SESSION_COOKIE_NAME=
API_SESSION_TTL_MS=604800000
API_AUTH_RATE_LIMIT_WINDOW_MS=600000
API_AUTH_RATE_LIMIT_MAX_ATTEMPTS=10

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=portfolio-fotografico
R2_PRIVATE_BUCKET=portfolio-fotografico-private
R2_PUBLIC_URL=https://uploads.yourdomain.com
R2_ENDPOINT=
R2_METADATA_PREFIX=data

# Cloudflare cache purge (opzionale, consigliato)
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=
```

Note:

- `PORT` è obbligatoria in sviluppo locale.
- `CORS_ORIGINS` è obbligatoria in sviluppo; in produzione è raccomandata (se assente verrà consentito solo `VERCEL_URL`).
- In produzione il backend è **R2-only**.
- In produzione è obbligatoria `API_WRITE_TOKEN_HASH` (token non in chiaro).
- `API_WRITE_TOKEN` è solo fallback in sviluppo.
- Le derivate pubbliche vengono esposte su `R2_PUBLIC_URL` in produzione (`/thumbnails/*`, `/social/*`, `/photo_*.webp`).
- Gli asset pubblici immagini usano cache revalidabile (no `immutable`) per supportare overwrite sugli stessi URL.
- Configura lato Cloudflare `X-Robots-Tag: noindex, noimageindex` su `/thumbnails/*` e `/social/*`.
- `R2_PRIVATE_BUCKET` è consigliata per i source full-res: il backend genera sempre le derivate partendo da source privata.
- Se imposti `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`, il backend esegue purge automatico su upload/regenerate/delete.
- In locale i metadati vengono mantenuti in `backend/storage/data` (nessun seed fallback da `backend/data`).

Genera hash del token:

```bash
cd backend
npm run token:hash -- "il-tuo-token-lungo"
```

### Frontend (`frontend/.env`)

```env
REACT_APP_SITE_URL=http://localhost:3000
REACT_APP_API_BASE_URL=http://localhost:5001/api
REACT_APP_IMAGES_BASE_URL=http://localhost:5001
```

Note:

- Non inserire segreti in variabili `REACT_APP_*`.
- Queste variabili sono validate prima di `npm start` e `npm run build`.
- `REACT_APP_IMAGES_BASE_URL` può essere stringa vuota se immagini/API sono servite dallo stesso dominio.

## Modalità admin

- Accesso: `https://tuodominio/admin`
- Logout rapido: `https://tuodominio/admin/logout`
- Le operazioni di write API richiedono sessione admin valida.

## Sicurezza API

- Helmet attivo con CSP base
- CORS allowlist sempre attiva (`CORS_ORIGINS`; in produzione viene aggiunto anche `VERCEL_URL` se presente)
- Cookie admin `HttpOnly`, `Secure` in produzione, `SameSite=strict`
- CSRF origin-check su metodi state-changing in produzione
- Rate limit globale + rate limit su login admin
- Auth header (`Authorization` / `x-api-key`) disabilitata in produzione

## Deploy su Vercel

### Variabili consigliate in Production

- `SITE_URL` (es. `https://kevinmuka.dev`)
- `API_WRITE_TOKEN_HASH`
- `API_SESSION_SECRET`
- `CORS_ORIGINS` (es. `https://kevinmuka.dev,https://www.kevinmuka.dev`)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PRIVATE_BUCKET` (consigliata, bucket privata source)
- `R2_PUBLIC_URL` (es. `https://uploads.kevinmuka.dev`)
- `CLOUDFLARE_ZONE_ID` (consigliata per purge automatico cache immagini)
- `CLOUDFLARE_API_TOKEN` (token Cloudflare con permesso Cache Purge)
- opzionali: `R2_ENDPOINT`, `R2_METADATA_PREFIX`, `API_SESSION_TTL_MS`, `API_AUTH_RATE_LIMIT_*`
- `REACT_APP_SITE_URL` (es. `https://kevinmuka.dev`)
- `REACT_APP_API_BASE_URL` (tipicamente `/api`)
- `REACT_APP_IMAGES_BASE_URL` (tipicamente stringa vuota o path assoluto)

Non necessari su Vercel:

- `PORT`
- `NODE_ENV`

Ogni modifica env richiede redeploy.

### Build/deploy

Vercel usa:

- `buildCommand`: `CI=false npm run vercel-build`
- output frontend: `frontend/build`
- API via `api/index.js`

### Post-Deploy Check

Esegui questa checklist dopo ogni deploy in produzione.

1. Health API:

```bash
curl -fsS https://kevinmuka.dev/api/health
```

2. Pagine principali:

- `https://kevinmuka.dev/`
- `https://kevinmuka.dev/series`
- `https://kevinmuka.dev/gallery`
- `https://kevinmuka.dev/map`

3. Dati runtime:

```bash
curl -fsS https://kevinmuka.dev/api/photos | head
curl -fsS "https://kevinmuka.dev/api/series?all=false" | head
```

4. Admin mode:

- apri `https://kevinmuka.dev/admin`
- verifica login sessione e una write operation (es. modifica titolo foto o serie)
- verifica logout su `https://kevinmuka.dev/admin/logout`

5. Asset R2:

- controlla che immagini e derivate (`thumbnail43`, `thumbnail11`, `socialImage`) carichino senza 403/404
- verifica almeno un URL asset dal JSON `/api/photos` (campo `image`/`thumbnail43`)

## Migrazione dati su R2

Se hai dati locali in `backend/storage`:

```bash
cd backend
npm run sync:r2
npm run sync:r2:metadata
```

Se hai foto storiche presenti solo nel bucket pubblico (`/uploads/...`) e vuoi popolare i nuovi `sourcePath` privati senza re-upload:

```bash
cd backend
npm run backfill:private-sources -- --dry-run
npm run backfill:private-sources
```

Opzionale:

- `--force` forza la ricopia e sovrascrive anche se `sourcePath` esiste gia.

Per popolare/rigenerare le derivate pubbliche (`image`, `thumbnails`, `social`) partendo dalle source private:

```bash
cd backend
npm run backfill:public-derivatives -- --dry-run
npm run backfill:public-derivatives
npm run backfill:public-derivatives -- --verify-only
```

Nota: i path pubblici (`image`, `thumbnail43`, `thumbnail11`, `socialImage`) vengono derivati a runtime da `photo.id`; in `backend/storage/data/photos.json` vengono salvati solo i campi canonici (metadati, source private, crop/settings, versioning).

Schema canonico (storage) per ogni foto:

```json
{
  "id": 1772709771525,
  "title": "Cascata",
  "description": "",
  "date": "2023-07-28",
  "location": { "name": "Fiè allo Sciliar, Italia", "lat": 46.511847, "lng": 11.582267 },
  "exif": {
    "camera": "Nikon D750",
    "lens": "Tamron SP 15-30mm F2.8 Di VC USD",
    "aperture": "f/22",
    "shutter": "1/5s",
    "iso": "50",
    "focal": "15mm"
  },
  "composition": { "cropProfiles": { "r43": {}, "r11": {}, "social": {} } },
  "tags": ["Alpe di Siusi"],
  "source": { "path": "/private/source/photo_1772709771525.jpeg", "contentType": "image/jpeg" },
  "derivativesVersion": 1772709835199
}
```

## Endpoint API principali

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`
- `GET /api/photos`
- `GET /api/photos/:id`
- `POST /api/photos/upload-url`
- `POST /api/photos`
- `POST /api/photos/:id/regenerate-derivatives`
- `PUT /api/photos/:id`
- `DELETE /api/photos/:id`
- `GET /api/series?all=false`
- `GET /api/series/:identifier`
- `POST /api/series`
- `PUT /api/series/:id`
- `DELETE /api/series/:id`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /sitemap-images.xml`

## Script utili

### Root

- `npm run setup` install dipendenze backend/frontend
- `npm start` avvio locale completo
- `npm run build` build frontend
- `npm run vercel-build` build usata da Vercel
- `npm run clean` pulizia `node_modules`

### Backend

- `npm run dev` avvio backend con nodemon
- `npm run token:hash -- "<token>"` genera hash scrypt
- `npm run sync:r2` upload locali -> R2
- `npm run sync:r2:metadata` metadati locali -> R2
- `npm run backfill:private-sources -- --dry-run` anteprima migrazione source private
- `npm run backfill:private-sources` copia source da pubblico a privato e aggiorna `photos.json`
- `npm run backfill:public-derivatives -- --dry-run` anteprima rigenerazione derivate pubbliche
- `npm run backfill:public-derivatives` rigenera derivate pubbliche da source private
- `npm run backfill:public-derivatives -- --verify-only` verifica copertura asset pubblici

## Troubleshooting rapido

### `EADDRINUSE: 5001`

Un altro processo usa la porta 5001. Chiudi il processo e riavvia.

### Login admin fallisce con 500 in produzione

Verifica nome variabile corretto: `API_WRITE_TOKEN_HASH`.

### Immagini non visibili in produzione

Controlla:

- `R2_PUBLIC_URL`
- dominio custom R2 attivo
- oggetti presenti nel bucket

### CORS su upload

Configura CORS del bucket R2 con origin del sito e metodi `GET,HEAD,PUT`.

## Note operative

- `backend/storage/` e runtime locale: non versionarlo.
- Ruota periodicamente i segreti (`API_WRITE_TOKEN_HASH`, `API_SESSION_SECRET`, chiavi R2).
