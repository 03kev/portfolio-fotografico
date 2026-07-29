# Kevin Muka | Portfolio Fotografico

Portfolio fotografico full-stack con:

- frontend React SPA
- backend Express condiviso tra locale e Vercel
- PostgreSQL/Neon per i metadati transazionali
- Cloudflare R2 per gli asset immagine
- source originali in bucket privata

Il progetto usa Neon e R2 in tutti gli ambienti, incluso lo sviluppo locale. Non
esiste più un fallback su storage locale.

## Quick Start

Requisiti:

- Node.js 20+
- npm 10+

1. Installa le dipendenze:

```bash
npm run setup
```

2. Crea i file env:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Configura R2 e variabili ambiente.

4. Avvia il progetto:

```bash
npm start
```

Servizi locali:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:5001`

## Architettura

- `frontend/`: SPA React, routing client-side, modal pubblici/admin, archivio, mappa, serie
- `backend/`: API Express, logica immagini, auth admin, SEO runtime, accesso R2
- `api/index.js`: entrypoint Vercel che monta il backend Express
- `vercel.json`: rewrites SPA/API/SEO e header statici
- Neon/PostgreSQL:
  - metadati foto e serie
  - integrità referenziale, concorrenza e audit admin
- Cloudflare R2:
  - bucket pubblica per le derivate
  - bucket privata per source full-res

Flusso immagini:

1. il frontend chiede una signed URL al backend
2. il browser carica la source direttamente nella bucket privata
3. il backend crea il record foto
4. il backend genera le derivate pubbliche partendo sempre dalla source privata
5. il frontend legge URL pubblici derivati da `photo.id` e dal relativo ULID

## Struttura progetto

```text
.
├── api/
│   └── index.js
├── backend/
│   ├── scripts/
│   │   └── hash-write-token.js
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   │   ├── assetPaths.js
│   │   │   ├── defaults.js
│   │   │   └── env.js
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── test/
├── frontend/
│   ├── branding/
│   ├── public/
│   └── src/
│       ├── __tests__/
│       ├── components/
│       ├── components/photoUpload/
│       ├── contexts/
│       ├── hooks/
│       ├── layout/
│       ├── pages/
│       ├── seo/
│       ├── styles/
│       ├── ui/
│       └── utils/
├── vercel.json
├── package.json
└── README.md
```

## Configurazione ambiente

### Backend (`backend/.env`)

Variabili principali:

```env
# Runtime
PORT=5001
NODE_ENV=development
SITE_URL=http://localhost:3000

# Metadata
METADATA_BACKEND=postgres
METADATA_WRITES_ENABLED=true
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require
TEST_DATABASE_URL=postgresql://...branch-test.../neondb?sslmode=require

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
R2_BUCKET=portfolio-images
R2_PRIVATE_BUCKET=portfolio-images-private
R2_PUBLIC_URL=https://uploads.yourdomain.com
R2_ENDPOINT=
R2_OBJECT_PREFIX=
R2_METADATA_PREFIX=data
```

Note importanti:

- `SITE_URL` e' obbligatoria in tutti gli ambienti.
- `PORT` e `CORS_ORIGINS` sono obbligatorie in sviluppo locale.
- `DATABASE_URL` è la connessione pooled di runtime.
- `DATABASE_URL_UNPOOLED` è usata da migration e import.
- `TEST_DATABASE_URL` deve puntare a un branch Neon isolato.
- Il backend e' R2-only in tutti gli ambienti.
- In produzione sono obbligatorie:
  - `API_WRITE_TOKEN_HASH`
  - `API_SESSION_SECRET`
- `API_WRITE_TOKEN` e' solo fallback locale.
- `R2_PRIVATE_BUCKET` e' fortemente consigliata: la source full-res parte sempre da li'.
- `R2_OBJECT_PREFIX` isola fisicamente gli asset scritti da una Preview.

Generazione hash token admin:

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

- non mettere segreti in `REACT_APP_*`
- il frontend valida queste variabili prima di `npm start` e `npm run build`
- `REACT_APP_IMAGES_BASE_URL` puo' essere vuota se immagini e frontend sono serviti dallo stesso host

## Cloudflare R2: bucket, domini e CORS

Questa e' la parte da configurare una volta bene. Dopo, il backend lavora in modo coerente senza fallback.

### 1. Crea due bucket

Configurazione consigliata:

- `R2_BUCKET`
  - bucket pubblica
  - contiene:
    - derivate pubbliche (`/uploads/...`)
    - snapshot JSON soltanto durante la transizione dal vecchio adapter
- `R2_PRIVATE_BUCKET`
  - bucket privata
  - contiene le source originali full-res (`/private/source/...`)

Se vuoi una separazione corretta tra pubblico e privato, mantieni due bucket distinte.

### 2. Collega un custom domain solo alla bucket pubblica

Esempio:

- custom domain pubblico: `uploads.kevinmuka.dev`
- env corrispondente:

```env
R2_PUBLIC_URL=https://uploads.kevinmuka.dev
```

Ogni set pubblico è identificato da un ULID e resta immutabile:

- immagine principale: `/uploads/photos/<id>/<ulid>/full.webp`
- variante mobile: `/uploads/photos/<id>/<ulid>/mobile.webp`
- thumbnail 4:3: `/uploads/photos/<id>/<ulid>/thumbnail-4x3.webp`
- thumbnail 1:1: `/uploads/photos/<id>/<ulid>/thumbnail-1x1.webp`
- social: `/uploads/photos/<id>/<ulid>/social.jpg`

La source privata usa un ULID di revisione indipendente:

- `/private/source/photos/<id>/<source-ulid>/source.<estensione>`

Crop e rigenerazione creano un nuovo set pubblico senza duplicare la source.
Il reupload crea invece una nuova revisione source e un nuovo set pubblico.

La bucket privata non deve avere un dominio pubblico.

### 3. Configura CORS sulla bucket privata

Serve per l'upload diretto da browser verso R2 tramite signed URL del backend.

Origins da includere:

- `http://localhost:3000`
- dominio produzione
- eventuale `www`
- eventuale dominio preview/develop se usato per testare upload admin

Configurazione minima consigliata:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://kevinmuka.dev",
      "https://www.kevinmuka.dev"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Se usi un dominio preview dedicato, aggiungilo esplicitamente.

### 4. Cache e indicizzazione sul dominio pubblico

I path ULID non vengono sovrascritti e possono usare:

```text
Cache-Control: public, max-age=31536000, immutable
```

Non è necessario eseguire purge Cloudflare quando cambia una foto: la
transazione Postgres rende visibile un nuovo URL.

Sul dominio R2 pubblico configura `X-Robots-Tag: noindex, noimageindex` per i
file il cui path termina con:

- `/thumbnail-4x3.webp`
- `/thumbnail-1x1.webp`
- `/social.jpg`

La full image rimane indicizzabile tramite la pagina canonica `/photo/:id`.

### 5. Migrazione una tantum dei path precedenti

Il comando è dry-run per impostazione predefinita:

```bash
cd backend
npm run media:paths:migrate
npm run media:paths:migrate -- --execute
```

Gli asset canonici precedenti vanno rimossi solo dopo il cutover production e
una verifica completa:

```bash
npm run media:paths:migrate -- \
  --cleanup-old-assets \
  --execute \
  --confirm-cutover
```

## Modalita admin

Route principali:

- login/admin UI: `https://tuodominio/admin`
- storico modifiche: `https://tuodominio/admin/history`
- logout rapido: `https://tuodominio/admin/logout`

Le write API richiedono sessione admin valida. In sviluppo, se non configuri credenziali admin, il backend segnala la cosa e le write possono restare aperte: non e' un setup consigliato, ma e' previsto come fallback locale.

## Sicurezza API

- `helmet` attivo con CSP base
- allowlist CORS sempre attiva
- cookie admin `HttpOnly`
- `Secure` in produzione
- `SameSite=strict`
- origin check sui metodi state-changing in produzione
- rate limit globale
- rate limit specifico sul login admin
- auth via header disabilitata in produzione

## Deploy su Vercel

Vercel usa:

- `buildCommand`: `CI=false npm run vercel-build`
- output frontend: `frontend/build`
- API serverless via `api/index.js`

### Variabili consigliate in Production

- `SITE_URL`
- `API_WRITE_TOKEN_HASH`
- `API_SESSION_SECRET`
- `CORS_ORIGINS`
- `METADATA_BACKEND=postgres`
- `METADATA_WRITES_ENABLED`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_URL`
- opzionali:
  - `R2_ENDPOINT`
  - `R2_OBJECT_PREFIX`
  - `R2_METADATA_PREFIX`
  - `API_SESSION_TTL_MS`
  - `API_AUTH_RATE_LIMIT_*`
- frontend:
  - `REACT_APP_SITE_URL`
  - `REACT_APP_API_BASE_URL`
  - `REACT_APP_IMAGES_BASE_URL`

Non necessari su Vercel:

- `PORT`
- `NODE_ENV`

Ogni modifica env richiede redeploy.

### Rewrites rilevanti

In `vercel.json`:

- `/api/:path*` -> backend
- `/uploads/:path*` -> backend
- `/robots.txt`, `/sitemap.xml`, `/sitemap-images.xml` -> backend
- `/photo/:id`, `/series` e `/series/:slug` per crawler e bot social -> backend SEO page
- tutto il resto -> `index.html`

La sitemap include automaticamente tutte le foto e le serie pubblicate con il
relativo `lastmod`. Le serie sono esposte come pagine hub prima delle singole
foto; le bozze non compaiono né nella sitemap né nelle pagine SEO server-side.

## Adapter JSON transitorio

PostgreSQL è lo storage autorevole quando `METADATA_BACKEND=postgres`.
L’adapter JSON R2 è mantenuto temporaneamente per migrazione e rollback e verrà
rimosso dopo il cutover verificato. I suoi snapshot si trovano sotto
`R2_METADATA_PREFIX` (default: `data`):

- `data/photos.json`
- `data/series.json`

### Schema canonico dello snapshot foto

L’adapter transitorio salva uno schema annidato e lo normalizza nel formato
runtime consumato dal frontend.

Esempio storage:

```json
{
  "id": 1772709771525,
  "title": "Cascata",
  "description": "",
  "date": "2023-07-28",
  "location": {
    "name": "Fiè allo Sciliar, Italia",
    "lat": 46.511847,
    "lng": 11.582267
  },
  "exif": {
    "camera": "Nikon D750",
    "lens": "Tamron SP 15-30mm F2.8 Di VC USD",
    "resolution": "6016x4016",
    "aperture": "f/22",
    "shutter": "1/5s",
    "iso": "50",
    "focal": "15mm"
  },
  "composition": {
    "cropProfiles": {
      "r43": {},
      "r11": {},
      "social": {}
    }
  },
  "tags": ["Alpe di Siusi"],
  "source": {
    "path": "/private/source/photos/1772709771525/01KYMPAMCGZG34TT5JX1BCBB9K/source.jpeg",
    "contentType": "image/jpeg"
  },
  "mediaGeneration": "01KYMPAMCGZG34TT5JX1BCBB9K",
  "derivativesVersion": 1772709835199
}
```

### Cosa viene derivato a runtime

Nel metadata record non vengono salvati i path pubblici finali come campi
canonici. L'API li costruisce a runtime a partire da `photo.id` e
`mediaGeneration`:

- `image`
- `thumbnail43`
- `thumbnail11`
- `socialImage`
- `url`

Questo evita ridondanza; l’ULID rende ogni set pubblico immutabile.

### Schema canonico delle serie

L’adapter JSON normalizza `data/series.json` sia in lettura sia prima di ogni
scrittura. Il repository Postgres applica le stesse invarianti in transazione:

- titoli e slug devono essere unici anche tra le bozze
- `photos` contiene ID numerici unici
- `coverImage` deve appartenere a `photos`
- i blocchi sono ordinati per posizione visiva (`layout.y`, poi `layout.x`)
- `order` non viene salvato: l'ordine canonico e' quello dell'array
- tutti i layout usano `unit: "grid"` su una griglia da 24 colonne
- i riferimenti foto nei blocchi devono appartenere alla serie
- se una serie contiene foto ma `content` e' vuoto, vengono creati blocchi foto espliciti

La griglia salvata descrive la composizione artistica desktop e non viene
ricalcolata in base alla finestra. Nella vista pubblica, fino a 1024 px, i
blocchi vengono proiettati in un flusso responsive ordinato per posizione:
testi ad altezza naturale, immagini senza crop e gruppi fotografici adattivi.
L'editor mantiene invece la tela desktop tramite scorrimento orizzontale, così
un accesso da tablet o telefono non può alterare involontariamente le coordinate
canoniche.

Le bozze sono restituite da `GET /api/series?all=true` e aperte per ID solo con una sessione admin valida. Le richieste anonime vedono esclusivamente le serie pubblicate.

### Source e derivate

- la source originale vive nel bucket privato
- le derivate pubbliche vengono sempre generate partendo da quella source
- `derivativesVersion` viene aggiornata quando:
  - carichi una nuova foto
  - fai replace della source privata
  - rigeneri le derivate

## Endpoint API principali

Auth:

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`

Health e SEO:

- `GET /api/health`
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /sitemap-images.xml`

Foto:

- `GET /api/photos`
- `GET /api/photos/:id`
- `POST /api/photos/upload-url`
- `POST /api/photos`
- `POST /api/photos/:id/replace-source`
- `POST /api/photos/:id/regenerate-derivatives`
- `PUT /api/photos/:id`
- `DELETE /api/photos/:id`

Serie:

- `GET /api/series?all=false`
- `GET /api/series?all=true` (solo sessione admin)
- `GET /api/series/:identifier`
- `POST /api/series`
- `PUT /api/series/:id`
- `DELETE /api/series/:id`
- `POST /api/series/:id/photos/:photoId`
- `DELETE /api/series/:id/photos/:photoId`

## Script utili

### Root

- `npm run setup` installa backend + frontend
- `npm run setup:backend`
- `npm run setup:frontend`
- `npm start` avvio locale completo
- `npm run build` build frontend
- `npm run vercel-build` build usata da Vercel
- `npm run lint`
- `npm run test`
- `npm run branding`
- `npm run clean`

### Backend

- `npm run dev`
- `npm run start`
- `npm run token:hash -- "<token>"`

### Frontend

- `npm start`
- `npm run build`
- `npm test`

## Post-Deploy Check

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

- login su `/admin`
- una write operation reale
- logout su `/admin/logout`

5. Asset R2:

- verifica almeno una `image`
- verifica almeno una `thumbnail43`
- verifica almeno una `socialImage`
- controlla assenza di `403/404`

## Troubleshooting rapido

### `EADDRINUSE: 5001`

Un altro processo sta usando la porta `5001`.

### Login admin fallisce in produzione

Controlla prima:

- `API_WRITE_TOKEN_HASH`
- `API_SESSION_SECRET`

### Upload source fallisce con errore CORS

Controlla il CORS della bucket privata:

- origin giusto
- metodo `PUT`
- header consentiti

### Immagini non visibili in produzione

Controlla:

- `R2_PUBLIC_URL`
- custom domain R2 attivo
- oggetti presenti nella bucket pubblica
- eventuale purge cache Cloudflare

### Replace source o regenerate non aggiorna subito l'immagine

Controlla:

- `derivativesVersion` aggiornato
- purge cache Cloudflare attiva
- eventuale cache browser/CDN ancora presente

## Note operative

- ruota periodicamente i segreti:
  - `API_WRITE_TOKEN_HASH`
  - `API_SESSION_SECRET`
  - chiavi R2
- non esporre mai la bucket privata con un custom domain pubblico
- se aggiungi un nuovo dominio frontend, ricordati di aggiornare:
  - `CORS_ORIGINS`
  - CORS della bucket privata
  - eventuali regole Cloudflare correlate
