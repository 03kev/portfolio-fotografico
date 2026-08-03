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
CRON_SECRET=replace_with_another_random_secret
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
- `R2_OBJECT_PREFIX` isola fisicamente gli asset scritti e ripuliti da una Preview.
  Prima di ogni deploy scrivibile, il valore normalizzato della Preview deve
  essere non vuoto e diverso da quello configurato in Production.
- Con `METADATA_WRITES_ENABLED=false` una Preview non può eseguire manualmente
  il cleanup; per abilitarlo servono Postgres, write abilitate e un
  `R2_OBJECT_PREFIX` non vuoto.

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

Sul dominio R2 pubblico usa una policy fail-closed: soltanto l'asset canonico
generato `photos/<id>/<ulid>/full.webp` resta image-indexable; ogni altro oggetto
riceve `X-Robots-Tag: noindex, noimageindex`. In una Cloudflare Response Header
Transform Rule, per il dominio attuale, la condizione può essere espressa come:

```text
http.host eq "uploads.kevinmuka.dev"
and not (
  http.request.uri.path contains "/photos/"
  and ends_with(http.request.uri.path, "/full.webp")
)
```

Questa regola copre automaticamente thumbnail, social, future preview e la root
del dominio senza mantenere una lista di filename e funziona anche con un
namespace R2 anteposto al path. La full image viene scoperta tramite la pagina
canonica `/photo/:id`; aggiungere un'altra eccezione indicizzabile è una
decisione SEO esplicita, non il default di una nuova variante.

### 5. Registro asset e migrazione metadata

Postgres registra ogni oggetto R2 in `photo_assets`; i path non vengono più
ricostruiti da una lista di varianti nelle route. La migration `008` importa i
path correnti e quelli già presenti nella coda di cleanup. Per ownership,
lifecycle, riconciliazione e procedura di aggiunta di una variante consulta
[`backend/src/repositories/README.md`](backend/src/repositories/README.md).

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
- `CRON_SECRET`
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

`CRON_SECRET` protegge `GET /api/internal/media-cleanup/run`. Vercel lo invia
automaticamente come Bearer token al cron giornaliero definito in
`vercel.json`. In Preview, dove i cron non vengono eseguiti, il cleanup viene
tentato dopo le operazioni admin e può essere avviato manualmente con una
sessione admin tramite `POST /api/internal/media-cleanup/run`, purché
`METADATA_WRITES_ENABLED=true` e `R2_OBJECT_PREFIX` sia configurato.

Prima di distribuire una Preview con scritture abilitate, confrontare nelle
Environment Variables di Vercel i due valori di `R2_OBJECT_PREFIX` dopo aver
rimosso slash iniziali/finali e spazi:

- Preview: deve essere non vuoto;
- Preview e Production: devono essere diversi;
- il namespace scelto deve appartenere esclusivamente a quella Preview.

Il backend può validare il primo requisito, ma non può confrontare
automaticamente due environment Vercel separati senza duplicare la
configurazione Production nella Preview. Questo confronto resta quindi un gate
operativo obbligatorio prima del deploy.

Il batch cron/manuale smette di reclamare job dopo 8 secondi; i piccoli batch
eseguiti dopo le operazioni admin hanno invece un budget di 1,5 secondi. Non
viene ridotto globalmente `maxDuration` di `api/index.js`, perché la stessa
funzione Express serve anche upload e altre API.

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

Il nuovo upload admin non è disponibile con `METADATA_BACKEND=json`: la
creazione idempotente richiede Postgres e restituisce
`TRANSACTIONAL_PHOTO_CREATION_REQUIRED`. Per provare upload e finalizzazione in
locale bisogna quindi usare esplicitamente `METADATA_BACKEND=postgres`.

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
  "assets": [
    {
      "role": "full",
      "replacementGroup": "derivatives",
      "scope": "public",
      "path": "/uploads/photos/1772709771525/01KYMPAMCGZG34TT5JX1BCBB9K/full.webp",
      "contentType": "image/webp",
      "generation": "01KYMPAMCGZG34TT5JX1BCBB9K"
    },
    {
      "role": "source",
      "replacementGroup": "source",
      "scope": "private",
      "path": "/private/source/photos/1772709771525/01KYMPAMCGZG34TT5JX1BCBB9K/source.jpeg",
      "contentType": "image/jpeg",
      "generation": "01KYMPAMCGZG34TT5JX1BCBB9K"
    }
  ],
  "mediaGeneration": "01KYMPAMCGZG34TT5JX1BCBB9K",
  "derivativesVersion": 1772709835199
}
```

### Cosa viene esposto a runtime

Postgres usa `photo_assets` come source of truth per path, ruolo, scope e
content type. L’API restituisce le varianti pubbliche dinamicamente in
`photo.assets`, indicizzate per ruolo; per esempio `full`, `mobile`,
`thumbnail-4x3`, `thumbnail-1x1` e `social`. Il source privato non viene esposto.

Il vecchio snapshot JSON non è una seconda source of truth. Lo snapshot
canonico conserva l'inventario attivo esplicito in `assets`; l’adapter non
ricostruisce ruoli dal catalogo corrente o dal solo `mediaGeneration`. Uno
snapshot legacy privo di inventario deve essere riconciliato con gli oggetti R2
prima del cutover: una variante candidata viene registrata soltanto dopo averne
verificato l’esistenza. L’import rifiuta snapshot senza inventario o senza
`full`, anziché importarli in uno stato implicitamente non pubblicabile.
`source.path` e `mobileImage` restano confinati nell’adapter esplicitamente
legacy del repository JSON e saranno rimossi insieme a quell’adapter dopo il
cutover. L’ULID rende ogni set di file immutabile.

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

- verifica almeno un asset `full`
- verifica almeno un asset `thumbnail-4x3`
- verifica almeno un asset `social`
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
