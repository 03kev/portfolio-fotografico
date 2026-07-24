# Audit tecnico completo

Data audit: 22 luglio 2026.

Questo documento raccoglie l'audit tecnico del frontend, del backend, dei flussi media, del SEO, del responsive design, del globo 3D, delle dipendenze e della configurazione di deploy.

Le verifiche automatiche eseguite durante l'audit hanno dato:

- build di produzione frontend: riuscita;
- lint frontend: riuscito;
- lint backend: non configurato;
- test backend: 4 test, tutti riusciti;
- test frontend: nessun test;
- audit dipendenze frontend: 58 segnalazioni, incluse 3 dipendenze dirette;
- audit backend: 8 segnalazioni, incluse `express` e `sharp`;
- bundle gzip: main circa 148 KB, Three.js circa 117 KB, Leaflet circa 71 KB, react-grid-layout circa 23 KB.

L'audit è basato su analisi statica, build e test. Non sono state inventate misurazioni FPS: per quantificare i miglioramenti del globo servirà una sessione Chrome Performance/Memory su desktop e telefono reale.

## Architettura attuale

Il frontend è una SPA React 18 basata su Create React App:

- routing con React Router;
- stato principale tramite `PhotoProvider` e `SeriesProvider`;
- styled-components e Framer Motion per UI e animazioni;
- Three.js per il globo;
- Leaflet per le mappe;
- react-grid-layout per il layout delle serie;
- Axios/XHR per le API e gli upload diretti.

Il backend Express viene usato sia localmente sia come funzione serverless Vercel:

- autenticazione admin tramite cookie HMAC;
- metadati in `photos.json` e `series.json` su R2;
- originali in bucket privata, se configurata;
- derivate pubbliche su R2;
- Sharp genera full, mobile, thumbnail e social;
- pagine SEO per foto e serie renderizzate dal backend per crawler selezionati;
- sitemap generale e sitemap immagini generate dinamicamente.

Flusso principale:

```text
React → Context/API client → Express
                         ├── JSON metadata su R2
                         ├── source privati su R2
                         └── derivate pubbliche su R2

Crawler → rewrite Vercel per user-agent → HTML SEO generato da Express
```

---

# Findings

## P0 — 1. Persistenza dei metadati soggetta a perdita di dati concorrente

### 1. Problema

Foto e serie vengono gestite tramite lettura completa del JSON, modifica in memoria e riscrittura completa. Due richieste concorrenti possono sovrascriversi.

Nell'upload di una foto il database viene letto prima della generazione delle cinque derivate: durante questa lunga finestra un secondo upload può leggere la stessa versione e l'ultima scrittura elimina silenziosamente il record dell'altro upload.

La pulizia delle serie contiene inoltre un bug: nei blocchi `type: "photos"` il contenuto è composto da oggetti `{ id, layout }`, ma viene trattato come array di ID numerici. I riferimenti possono quindi restare nel JSON.

### 2. Dove

- `backend/src/services/metadataStorage.js`, `readMetadataFile` e `writeMetadataFile`;
- `backend/src/routes/photos.js`, creazione foto;
- `backend/src/routes/series.js`, operazioni di scrittura;
- `backend/src/services/seriesPhotoCleanup.js`, pulizia riferimenti.

### 3. Perché è un problema

Può causare perdita irreversibile di metadati, serie incoerenti, foto mancanti dopo upload simultanei e riferimenti a immagini eliminate.

### 4. Causa

R2 object storage viene utilizzato come database transazionale. I lock presenti sono process-locali, limitati ad alcune operazioni sulla stessa foto e non funzionano tra istanze serverless.

### 5. Soluzione proposta

Introdurre prima un'interfaccia repository, senza riscrivere le route, e spostare gradualmente i metadati su uno storage transazionale.

La soluzione preferibile è un piccolo database relazionale con transazioni e vincoli tra foto e serie, lasciando R2 solo per i file. Come ponte temporaneo è possibile usare scritture condizionali ETag/CAS con retry, se supportate dal provider in uso, ma non risolve bene le modifiche che coinvolgono contemporaneamente foto e serie.

Correggere subito la pulizia dei blocchi `photo` e `photos` e aggiungere test sui riferimenti annidati.

### 6. Scope

Storage metadata, route foto/serie, cleanup, migrazione dei due JSON e test backend.

### 7. Rischio

**HIGH**

### 8. Priorità

**P0**

### 9. Dipendenze

Deve precedere la revisione dell'atomicità della pipeline media. Richiede prima test di concorrenza e una procedura di backup/migrazione.

---

## P0 — 2. Il loop del globo sopravvive all'unmount

### 1. Problema

Il globo avvia un `requestAnimationFrame` ricorsivo senza conservarne l'ID e senza annullarlo nel cleanup. Uscendo dalla pagina, il loop continua a eseguire logica e render contro risorse già disposte.

`triggerOnce: true` ritarda soltanto la prima inizializzazione: non sospende il globo quando esce dal viewport. Non c'è sospensione su `document.hidden`.

Anche le animazioni di focus/zoom hanno RAF non centralizzati e il caricamento asincrono delle texture non controlla se il componente sia stato smontato.

### 2. Dove

- `frontend/src/components/WorldMap.js`, `useInView`, animation loop, cleanup e texture loading;
- `frontend/src/utils/WorldMapNavigation.js`.

### 3. Perché è un problema

Ogni visita alla pagina può aggiungere un nuovo loop permanente. Questo causa CPU/GPU in background, memoria trattenuta, possibili errori WebGL e degrado progressivo durante la sessione.

### 4. Causa

Il renderer non ha un lifecycle controller unico. RAF, texture async, listener e animazioni secondarie sono gestiti separatamente.

### 5. Soluzione proposta

Creare un controller interno minimale con:

- un solo RAF registrato;
- `start`, `pause`, `resume`, `dispose`;
- pausa quando fuori viewport;
- pausa quando `document.hidden`;
- cancellazione di tutti i RAF nel cleanup;
- flag `disposed` per ignorare texture caricate dopo l'unmount;
- listener nominati e rimovibili;
- rendering manuale finale quando il loop viene sospeso.

### 6. Scope

`WorldMap`, animazioni di navigazione/focus e lifecycle dei listener WebGL.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P0**

### 9. Dipendenze

Indipendente dal backend. Deve precedere le ulteriori ottimizzazioni del globo, altrimenti le misurazioni resterebbero falsate dai loop residui.

---

## P1 — 3. Il costo principale del globo è nel modello di aggiornamento, non nella geometria

### 1. Problema

Il loop esegue lavoro evitabile a ogni frame:

- aggiorna React con `setCompassRotation` circa 30 volte al secondo;
- per ogni marker clona più vettori e ricalcola posizione e orientamento;
- crea nuovi vettori per la luce a ogni frame;
- aggiorna controlli e render anche quando nulla cambia;
- quando cambia livello ricrea marker senza disporre immediatamente geometrie e materiali;
- auto-rotazione e inertia sono dipendenti dal frame rate.

Le due texture 8192×4096 sono il secondo grande costo. Decodificate come texture RGBA possono arrivare a circa 128 MiB ciascuna, quindi circa 256 MiB complessivi prima delle mipmap.

### 2. Dove

- `frontend/src/components/WorldMap.js`, bussola, marker e render loop;
- `frontend/src/utils/WorldMapNavigation.js`, metodo `update`;
- `frontend/public/textures/8k_earth_v2.jpg`;
- `frontend/public/textures/boundaries_8k.png`.

### 3. Perché è un problema

Produce garbage collection, rerender React continui e traffico CPU→GPU. Sui telefoni il costo delle texture può essere più grave del trasferimento dei file e portare a context loss.

### 4. Causa

Terra, confini e marker vengono sincronizzati come oggetti separati. Lo stato visuale della bussola passa per React nel percorso caldo. Il renderer lavora sempre in modalità continua.

### 5. Soluzione proposta

Conservando l'aspetto attuale:

- inserire terra, confini e marker in un unico `THREE.Group`;
- ruotare il gruppo una sola volta, eliminando l'aggiornamento O(numero marker);
- condividere geometrie/materiali dei marker o usare `InstancedMesh` se il numero lo giustifica;
- usare vettori/quaternion temporanei riutilizzabili;
- aggiornare la bussola via ref/CSS transform oppure solo quando la variazione supera una soglia;
- usare delta time per auto-rotazione e inertia;
- passare a render-on-demand quando auto-rotate, drag e inertia sono fermi;
- predisporre texture 2K/4K/8K: scegliere in base alla dimensione reale del canvas e DPR, non in base allo user-agent;
- caricare prima una variante leggera e sostituirla durante idle solo quando la risoluzione superiore è effettivamente visibile;
- valutare KTX2/Basis per mantenere dettaglio riducendo memoria GPU;
- rispettare `prefers-reduced-motion`.

### 6. Scope

`WorldMap`, `WorldMapNavigation`, marker factory, texture e asset build.

### 7. Rischio

**MEDIUM/HIGH**

### 8. Priorità

**P1**

### 9. Dipendenze

Dopo il fix del lifecycle. Prima profilare la versione attuale e conservare una baseline visiva/FPS/memoria.

---

## P1 — 4. La pipeline media non è atomica e non ha limiti sufficienti sulle immagini

### 1. Problema

La creazione carica source e cinque derivate prima di salvare il record; un errore lascia file orfani. Il replace sovrascrive chiavi pubbliche stabili prima di aggiornare i metadati. La delete elimina prima il record e poi tenta di rimuovere asset e riferimenti.

L'upload firmato controlla dimensione e MIME dichiarati dal client, ma non verifica abbastanza presto dimensione effettiva, formato reale, pixel totali, pagine/animazioni o immagini decompression bomb.

Cinque pipeline Sharp vengono eseguite contemporaneamente mantenendo più buffer in memoria.

### 2. Dove

- `backend/src/routes/photos.js`, upload URL, create, replace e delete;
- `backend/src/services/photoDerivatives.js`;
- `backend/src/config/env.js`.

### 3. Perché è un problema

Possibili file orfani, metadati e immagini non sincronizzati, picchi di memoria/CPU in serverless e rischio di abuso dell'endpoint di elaborazione.

Se `R2_PRIVATE_BUCKET` manca, gli originali finiscono nel bucket pubblico: è contrario all'obiettivo di protezione delle fotografie.

### 4. Causa

Manca un confine transazionale/idempotente per l'intera operazione media e si considera affidabile il metadata fornito dal browser.

### 5. Soluzione proposta

- chiavi versionate o temporanee per ogni rigenerazione;
- validazione Sharp del file reale prima della generazione;
- limiti su formato, dimensioni, pixel, pagine e Content-Length R2;
- MIME consentiti identici fra frontend e backend;
- concorrenza Sharp limitata e varianti generate a gruppi;
- commit metadata solo quando tutte le derivate sono pronte;
- cleanup/reconciliation idempotente per asset temporanei;
- `R2_PRIVATE_BUCKET` obbligatoria in produzione;
- operation ID per retry sicuri.

### 6. Scope

Route foto, storage R2, Sharp, configurazione ambiente e gestione errori upload.

### 7. Rischio

**HIGH**

### 8. Priorità

**P1**

### 9. Dipendenze

Dopo la messa in sicurezza dello storage metadata. L'aggiornamento di Sharp va eseguito in questa fase con test di output visivo.

---

## P1 — 5. Stato frontend troppo ampio e richieste asincrone non sempre protette da race condition

### 1. Problema

`PhotoContext` contiene catalogo, filtri, modal, mappa, upload pendenti e stato delle operazioni. Un aggiornamento di upload può notificare tutti i consumer.

`fetchPhotos` usa soltanto una finestra temporale di 500 ms: non abortisce richieste precedenti e non impedisce a una risposta vecchia di sovrascriverne una nuova. `fetchSeriesBySlug` ha lo stesso rischio.

Foto e serie vengono sincronizzate con `window.CustomEvent`, creando dipendenze invisibili. `ADD_PHOTO` aggiunge inoltre la nuova foto anche a `galleryPhotos`, che può rappresentare un cluster selezionato e non l'intero archivio.

### 2. Dove

- `frontend/src/contexts/PhotoContext.js`;
- `frontend/src/contexts/SeriesContext.js`;
- `frontend/src/utils/api.js`.

### 3. Perché è un problema

Rerender inutili, stato visivo incoerente, possibili serie errate durante navigazioni rapide e coupling difficile da seguire.

### 4. Causa

Il context è diventato sia data cache, sia UI store, sia coordinatore delle operazioni admin.

### 5. Soluzione proposta

Senza introdurre Redux:

- separare catalogo/query, viewer/modal e operazioni admin in 2–3 context mirati;
- usare `AbortController`, request ID o promise condivisa per fetch concorrenti;
- sostituire i CustomEvent con invalidazione esplicita del catalogo;
- distinguere chiaramente archivio completo e collezione del modal cluster;
- unificare le coppie duplicate `addPhoto/createPhotoInBackground` e `updatePhoto/updatePhotoInBackground` tramite opzioni interne.

### 6. Scope

Context foto/serie, componenti consumer, API client e upload.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P1**

### 9. Dipendenze

Può essere affrontato dopo la stabilizzazione del backend. La separazione responsive non è obbligatoria, ma semplifica alcuni consumer.

---

## P1 — 6. La distinzione mobile/desktop/capability è ancora dispersa

### 1. Problema

Esiste una buona base centralizzata, ma viene usata solo in pochi punti. La maggioranza dei componenti contiene breakpoint hardcoded `640`, `768`, `900`, `1024` e `1120`.

`useMobileDeviceLayout` combina larghezza, touch, hover, pointer e user-agent in un singolo risultato. È utile per alcune gesture, ma il nome induce a usarlo anche come decisione di layout.

Esiste anche un secondo oggetto `BREAKPOINTS` inutilizzato e incoerente.

### 2. Dove

- `frontend/src/styles/responsive.js`;
- `frontend/src/utils/constants.js`;
- `frontend/src/hooks/useMobileDeviceLayout.js`;
- `frontend/src/hooks/useMeasuredLayoutMode.js`;
- `frontend/src/components/Gallery.js`;
- `frontend/src/components/PhotoModal.js`.

### 3. Perché è un problema

Un desktop stretto può finire in percorsi pensati per dispositivi touch, mentre un tablet landscape può ricevere decisioni non adatte. Modificare un breakpoint richiede interventi distribuiti.

Inoltre l'header passa un nuovo array `observedRefs` a ogni render, facendo ricreare ResizeObserver e listener.

### 4. Causa

Concetti distinti — viewport, input capability, fit del contenuto e capacità hardware — sono cresciuti senza un contratto condiviso.

### 5. Soluzione proposta

Architettura leggera:

- breakpoint CSS centralizzati come unica fonte;
- `useMediaQuery` per decisioni JS strettamente necessarie;
- hook separati per `coarsePointer`, `canHover`, `reducedMotion`, `saveData`;
- layout basato sul viewport o sul contenitore;
- gesture basate sulle capability;
- qualità/performance basata su misure effettive, non su "mobile";
- user-agent soltanto per bug browser documentati;
- rendere stabile `observedRefs` o accettare ref nominate nel hook misurato.

### 6. Scope

Stili responsive, hook, header, gallery, modal, serie, upload e globo.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P1**

### 9. Dipendenze

Da fare prima dei refactoring locali responsive dei singoli componenti.

---

## P1 — 7. Dipendenze vulnerabili e copertura test insufficiente

### 1. Problema

Al 22 luglio 2026 `npm audit --omit=dev` rileva:

- frontend: 58 segnalazioni; dirette su Axios 1.11.0, React Router 6.30.1 e react-scripts 5.0.1;
- backend: 8 segnalazioni; dirette su Express 4.21.2 e Sharp 0.32.6;
- Sharp richiede un aggiornamento major;
- Create React App trascina molte segnalazioni di toolchain perché `react-scripts` è classificato come dipendenza di produzione.

Il frontend non ha test; il backend ha solo quattro test su `seriesRecord`. Non c'è lint backend.

### 2. Dove

- `frontend/package.json`;
- `backend/package.json`;
- `backend/src/services/seriesRecord.test.js`.

### 3. Perché è un problema

Ci sono vulnerabilità dirette e i refactoring più rischiosi — storage, upload, gesture, cronologia modal e globo — non sono protetti da regressioni automatiche.

### 4. Causa

Dipendenze installate con range molto vecchi e assenza di una quality gate comune.

### 5. Soluzione proposta

- aggiornare subito Axios, React Router ed Express alle versioni corrette;
- aggiornare Sharp durante la revisione media, confrontando checksum/dimensioni delle derivate;
- aggiungere lint backend;
- test di concorrenza metadata, cleanup serie, validazione upload e cache;
- test React per Context, modal history, responsive hooks e route foto;
- smoke E2E desktop/mobile per archivio, modal, serie e upload;
- migrare CRA a Vite in una fase separata, non come requisito per gli altri fix.

### 6. Scope

Dipendenze, CI, test frontend/backend e configurazione build.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P1**

### 9. Dipendenze

La copertura minima deve precedere P0/P1 più invasivi. La migrazione Vite può essere posticipata.

---

## P1 — 8. URL immutabili e chiavi sovrascritte non formano un contratto cache sicuro

### 1. Problema

Le derivate pubbliche usano `max-age=31536000, immutable`, ma le chiavi come `photo_ID.webp` vengono sovrascritte.

Il frontend aggiunge `?v=derivativesVersion`, mentre pagine SEO e sitemap costruiscono URL non versionati. Il purge Cloudflare è opzionale e best-effort.

### 2. Dove

- `backend/src/services/r2Storage.js`;
- `frontend/src/utils/imageUrl.js`;
- `backend/src/app.js`, costruzione URL SEO;
- `backend/src/services/cloudflareCache.js`.

### 3. Perché è un problema

Browser, crawler, Google Immagini e social preview possono conservare per mesi un'immagine vecchia anche dopo una rigenerazione.

### 4. Causa

Si usa cache content-addressed senza avere URL content-addressed.

### 5. Soluzione proposta

Usare chiavi fisicamente versionate, per esempio `photo_ID/VERSION/full.webp`, e salvare quelle chiavi nei metadati. La rigenerazione crea nuovi oggetti e poi committa il nuovo record.

Le vecchie versioni possono essere eliminate con retention differita dopo alcuni giorni. In alternativa, ogni consumer SEO deve usare lo stesso query versionato e va verificato che il CDN includa la query nella cache key.

### 6. Scope

Asset paths, storage, record foto, frontend URL resolver, SEO, sitemap e cleanup.

### 7. Rischio

**HIGH**

### 8. Priorità

**P1**

### 9. Dipendenze

Si integra bene con la pipeline media atomica e con la migrazione metadata.

---

## P1 — 9. Accessibilità incompleta per modal e contenuti interattivi

### 1. Problema

I principali modal non espongono sistematicamente `role="dialog"`, `aria-modal`, focus trap, focus iniziale e ripristino del focus.

Vari card cliccabili sono `div` animati senza semantica tastiera. Il link SEO interno alla card è intenzionalmente nascosto da tastiera, quindi non compensa l'assenza di un vero link interattivo.

### 2. Dove

- `frontend/src/components/PhotoModal.js`;
- `frontend/src/components/GalleryModal.js`;
- lightbox in `frontend/src/components/SeriesDetail.js`;
- `frontend/src/components/gallery/GalleryCard.js`.

### 3. Perché è un problema

Navigazione da tastiera e screen reader incoerente, focus che può finire dietro al modal e impossibilità di aprire alcune foto senza mouse/touch.

### 4. Causa

Overlay, gesture e semantica sono stati sviluppati separatamente.

### 5. Soluzione proposta

Creare una piccola primitive condivisa per il comportamento dialog, non per l'aspetto:

- focus trap;
- `Escape`;
- focus restore;
- blocco del background con `inert`;
- label accessibile;
- un solo layer di gestione history.

Rendere le card veri `Link`/`button`, mantenendo long press e animazioni tramite wrapper.

### 6. Scope

Modal foto/galleria/crop/editor/token, lightbox serie e card archivio.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P1**

### 9. Dipendenze

Meglio dopo aver stabilizzato la gestione modal/context, ma prima di rimuovere la lightbox duplicata delle serie.

---

## P2 — 10. Alcuni file concentrano troppe responsabilità e impediscono ottimizzazioni locali

### 1. Problema

`SeriesDetail` contiene SEO, fetch, rendering pubblico desktop/mobile, editor admin, algoritmo grid, toolbar e lightbox in 2757 righe. Importa staticamente react-grid-layout e `SeriesEditor`, anche per la vista pubblica desktop.

`app.js` backend contiene middleware, proxy file, pagine SEO e sitemap in 879 righe.

`PhotoCropModal` aggiorna stato e profilo a ogni `pointermove`.

### 2. Dove

- `frontend/src/components/SeriesDetail.js`;
- `frontend/src/components/series/ResponsiveSeriesContent.js`;
- `frontend/src/components/PhotoCropModal.js`;
- `backend/src/app.js`.

### 3. Perché è un problema

Aumenta coupling, rende fragili le modifiche responsive e impedisce di caricare l'editor soltanto quando serve.

### 4. Causa

Vista pubblica e strumenti amministrativi condividono lo stesso controller e lo stesso renderer.

### 5. Soluzione proposta

- estrarre funzioni pure per layout serie e aggiungere test;
- separare renderer pubblico, editor desktop e controller;
- lazy-load dell'editor solo per admin/layout mode;
- valutare CSS Grid per il rendering pubblico statico, conservando react-grid-layout solo nell'editor;
- usare il PhotoModal globale anche per le foto delle serie, rimuovendo la lightbox duplicata;
- rAF-batching nel crop, salvando il profilo alla fine del frame/drag;
- estrarre router/service SEO e sitemap da `app.js`.

### 6. Scope

Serie, modal foto, crop admin e backend SEO.

### 7. Rischio

**MEDIUM/HIGH**

### 8. Priorità

**P2**

### 9. Dipendenze

Dopo responsive contract, test e stabilizzazione dello stato modal.

---

## P2 — 11. Letture API e SEO scalano linearmente con l'intero archivio

### 1. Problema

Molte richieste scaricano e parsano l'intero `photos.json` e `series.json`. `GET /photos` restituisce tutti i record completi, comprese impostazioni non necessarie alle card.

La logica SEO è duplicata tra backend e frontend. Le route crawler dipendono da una allowlist user-agent in `vercel.json`.

### 2. Dove

- `backend/src/routes/photos.js`, lista foto;
- `backend/src/app.js`, SEO e sitemap;
- `frontend/src/pages/PhotoPage.js`;
- `frontend/src/components/SeriesDetail.js`, SEO serie;
- `vercel.json`.

### 3. Perché è un problema

Il costo cresce con tutto l'archivio, anche per aprire una singola foto. La duplicazione SEO può produrre metadata differenti tra crawler e navigazione client-side.

### 4. Causa

I JSON sono usati contemporaneamente come persistenza, indice e API response.

### 5. Soluzione proposta

Dopo la migrazione storage:

- endpoint lista leggero e paginato;
- endpoint dettaglio per foto/serie;
- query pubblicate/non pubblicate lato repository;
- cache breve con invalidazione sulle write;
- builder SEO condivisi o contract test che confrontino output frontend/backend;
- mantenere per ora il dynamic rendering, senza introdurre una riscrittura SSR completa.

### 6. Scope

Repository, API client, gallery, photo route, SEO e sitemap.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P2**

### 9. Dipendenze

Dopo il nuovo livello di persistenza. Prima va misurata la dimensione reale prevista dell'archivio.

---

## P2 — 12. Hardening backend e deploy incompleto

### 1. Problema

Le risposte 500 possono includere `error.message` in `details.reason`. CORS accetta anche una origin con lo stesso host ma schema diverso. Il rate limit è in-memory e quindi non coordinato tra istanze serverless.

La SPA servita direttamente da Vercel non eredita automaticamente Helmet del backend; `vercel.json` non dichiara una baseline completa di security headers. La lunghezza minima del session secret non è verificata.

### 2. Dove

- `backend/src/routes/photos.helpers.js`;
- `backend/src/app.js`, configurazione CORS;
- `backend/src/config/env.js`;
- `vercel.json`.

### 3. Perché è un problema

Possibile esposizione di dettagli R2/infrastrutturali, controllo origine meno preciso e protezione brute-force non uniforme.

### 4. Causa

Configurazione pensata inizialmente per un server Express persistente, ma distribuita su frontend statico e funzioni serverless.

### 5. Soluzione proposta

- errori pubblici tipizzati, request ID e dettagli soltanto nei log;
- allowlist origin esatta;
- secret minimo di almeno 32 byte casuali;
- rate limit distribuito o WAF/edge per login e write;
- header Vercel: HSTS, Referrer-Policy, Permissions-Policy, nosniff e CSP testata;
- CSP introdotta dopo aver rimosso o autorizzato esplicitamente font, R2 e Leaflet esterni.

### 6. Scope

Middleware backend, auth, logging, environment e Vercel.

### 7. Rischio

**MEDIUM**

### 8. Priorità

**P2**

### 9. Dipendenze

CSP dopo la pulizia degli asset esterni. Aggiornamento Express prima o nella stessa fase.

---

## P2 — 13. Asset globali e caricamento iniziale ancora semplificabili

### 1. Problema

Tutte le pagine caricano quattro famiglie Google Fonts con numerosi pesi. Il CSS Leaflet viene caricato globalmente da unpkg nonostante Leaflet sia una funzionalità lazy e il pacchetto includa già il CSS locale.

Il main bundle è circa 148 KB gzip. PhotoModal e infrastruttura globale restano nel bundle principale. La build pubblica include source map.

### 2. Dove

- `frontend/public/index.html`;
- `frontend/src/layout/SiteLayout.js`;
- `frontend/src/App.js`.

### 3. Perché è un problema

Font e CSS esterni influenzano ogni route, anche quando non sono usati. L'unpkg globale introduce una dipendenza di rete e rende più difficile una CSP stretta.

### 4. Causa

Asset route-specific sono stati promossi a globali.

### 5. Soluzione proposta

- self-host/subset dei font realmente usati;
- Inter globale, font editoriali caricati solo quando una serie li richiede;
- rimuovere Leaflet CSS da `index.html` e importarlo nel chunk mappa;
- valutare lazy-load del PhotoModal con preload durante idle in gallery;
- disabilitare source map pubbliche in produzione se non servono al monitoraggio.

### 6. Scope

HTML, font, route map, layout globale e configurazione build.

### 7. Rischio

**LOW/MEDIUM**

### 8. Priorità

**P2**

### 9. Dipendenze

CSP dopo questo intervento. La migrazione Vite può inglobare la gestione source map.

---

## P3 — 14. Dead code e fonti di configurazione duplicate

### 1. Problema

Restano costanti non utilizzate, una seconda definizione dei breakpoint, helper/export apparentemente non importati e alcune API di serie non più usate dalla UI.

`NavigationHelpers` in `WorldMap` risulta esportato ma non usato. Alcune coppie di azioni Context sono quasi identiche.

### 2. Dove

- `frontend/src/utils/constants.js`;
- `frontend/src/components/WorldMap.js`;
- `frontend/src/contexts/SeriesContext.js`;
- `frontend/src/contexts/PhotoContext.js`.

### 3. Perché è un problema

Aumenta il numero di percorsi apparentemente supportati e rende difficile capire quale configurazione sia autorevole.

### 4. Causa

Refactoring incrementali non seguiti da una fase finale di rimozione.

### 5. Soluzione proposta

Rimuovere soltanto dopo verifica tramite import graph e test. Mantenere una singola fonte responsive e una singola implementazione per operazione.

Negli script backend è già rimasto essenzialmente solo quello per il token: non è necessario un ulteriore cleanup urgente in quella cartella.

### 6. Scope

Utility, Context, export, route/API non usate e documentazione.

### 7. Rischio

**LOW**

### 8. Priorità

**P3**

### 9. Dipendenze

Ultima fase, dopo i refactoring P1/P2, perché parte del codice potrebbe scomparire naturalmente.

---

# Cose già implementate bene e che non toccherei senza motivo

- Il code splitting delle route è corretto e isola Three.js, Leaflet e gran parte dell'admin.
- Il fallback delle route lazy è presente: non è necessario sostituire il routing.
- La gallery usa caricamento progressivo, thumbnail, lazy loading e batch ridotti su mobile.
- Il PhotoModal usa la variante mobile iniziale, qualità originale opt-in, preload condizionale e cache condivisa.
- Lo zoom modifica direttamente una transform CSS tramite RAF invece di aggiornare React a ogni movimento.
- Lo swipe informazioni viene distinto dal pan quando la foto è zoommata: non bisogna unificare nuovamente le due gesture.
- Il globo ha già alcune scelte corrette: lazy route, DPR limitato a 1.5, ombre disattivate, antialias limitato e clustering memoizzato. Non ridurrei per prima cosa la geometria 64×64.
- L'header misura il contenuto reale invece di assumere sempre `mobile === viewport stretto`: l'idea va mantenuta e rifinita.
- `ResponsiveSeriesContent` è un buon approccio incrementale; non è consigliabile cancellare il layout desktop o riscrivere tutto.
- L'autenticazione production usa cookie HttpOnly/Secure/SameSite, firma HMAC, hash del token e origin check sulle write. La base è buona.
- SEO di foto e serie include canonical, sitemap, ImageObject, copyright, licenza e pagine crawler con 404/noindex corretti.
- La priorità sitemap delle serie è già superiore a quella delle singole foto.
- Gli originali e le derivate sono concettualmente separati; va soltanto resa obbligatoria la bucket privata.
- Lo streaming del download evita di caricare l'immagine completa nella memoria del browser.
- La normalizzazione delle serie e l'unicità di titolo/slug sono un miglioramento valido e vanno mantenute.

# Recommended implementation order

## Fase 1 — Quality gate e baseline

**Obiettivo:** poter modificare le parti critiche con misure e test ripetibili.

**Interventi:**

- test concorrenza metadata;
- test cleanup serie;
- test route foto/modal/history;
- smoke E2E mobile/desktop;
- lint backend;
- baseline globo: FPS, CPU, heap, GPU/context count, traffico texture;
- aggiornamenti non-major di Axios, React Router ed Express.

**Perché ora:** i successivi interventi sono ad alto rischio.

**Rischio regressioni:** LOW/MEDIUM.

**Test:** build, API, upload, route `/photo/:id`, serie, login e modal.

## Fase 2 — Persistenza transazionale

**Obiettivo:** eliminare il rischio di perdita dati.

**Interventi:**

- repository metadata;
- database transazionale o bridge CAS;
- migrazione JSON;
- vincoli foto/serie;
- cleanup corretto dei blocchi;
- UUID/ULID invece di `Date.now()`.

**Perché ora:** è il rischio funzionale più grave e abilita atomicità media.

**Rischio regressioni:** HIGH.

**Test:** upload concorrenti, modifiche serie concorrenti, rollback, backup/restore, delete con riferimenti annidati.

## Fase 3 — Lifecycle del globo

**Obiettivo:** fermare consumo residuo e memory leak.

**Interventi:**

- RAF controller unico;
- IntersectionObserver continuo;
- Page Visibility;
- cancellazione animazioni e texture async;
- listener nominati;
- cleanup context restore.

**Perché ora:** è il fix più urgente del globo e rende attendibile il profiling.

**Rischio regressioni:** MEDIUM.

**Test:** entra/esci dalla route ripetutamente, scroll fuori viewport, cambio tab, context loss/restore, navigazione modal.

## Fase 4 — Rendering efficiente del globo

**Obiettivo:** mantenere l'aspetto riducendo CPU, GPU e memoria.

**Interventi:**

- gruppo unico terra/confini/marker;
- geometrie/materiali condivisi;
- zero allocazioni nel loop;
- bussola fuori da React hot path;
- delta time;
- render-on-demand;
- texture tier/KTX2;
- reduced motion.

**Perché ora:** con lifecycle corretto si può misurare ogni ottimizzazione isolatamente.

**Rischio regressioni:** MEDIUM/HIGH.

**Test:** confronto visivo, drag/inertia/north-lock, cluster, focus, dispositivi low-end, memoria GPU e texture swap.

## Fase 5 — Pipeline media atomica

**Obiettivo:** rendere upload, replace, regenerate e delete idempotenti e sicuri.

**Interventi:**

- chiavi temporanee/versionate;
- validazione contenuto reale;
- limiti pixel/formato;
- Sharp aggiornato;
- concorrenza controllata;
- cleanup/reconciliation;
- bucket privata obbligatoria.

**Perché ora:** dipende dal repository transazionale.

**Rischio regressioni:** HIGH.

**Test:** file corrotti, MIME falso, immagini enormi, timeout parziale, retry, output delle cinque varianti, delete incompleta.

## Fase 6 — Contratto responsive e capability

**Obiettivo:** distinguere correttamente viewport, input e performance.

**Interventi:**

- unica fonte breakpoint;
- hook capability separati;
- migrazione progressiva dei breakpoint hardcoded;
- fix ResizeObserver header;
- matrice viewport/capability.

**Perché ora:** deve precedere i refactoring locali di serie, gallery e modal.

**Rischio regressioni:** MEDIUM.

**Test:** desktop largo/stretto, tablet portrait/landscape, touch laptop, mouse su tablet, resize live e tastiera.

## Fase 7 — Confini frontend e accessibilità

**Obiettivo:** ridurre rerender e accoppiamento.

**Interventi:**

- split PhotoContext;
- richieste cancellabili;
- rimozione CustomEvent;
- separazione SeriesDetail pubblico/editor;
- editor lazy;
- dialog primitive accessibile;
- unificazione lightbox/PhotoModal;
- crop rAF-batched.

**Perché ora:** sfrutta il responsive contract già stabilizzato.

**Rischio regressioni:** MEDIUM/HIGH.

**Test:** navigazione rapida, upload progress, cluster modal, back button, focus trap, tastiera, pinch/pan/swipe.

## Fase 8 — Cache, SEO e API pubbliche

**Obiettivo:** avere URL media coerenti e metadata senza duplicazioni.

**Interventi:**

- asset path versionati;
- sitemap e structured data sugli stessi URL;
- retention vecchie versioni;
- API lista/dettaglio;
- contract test SEO crawler/SPA;
- cache backend con invalidazione.

**Perché ora:** dipende da storage e pipeline media.

**Rischio regressioni:** HIGH per cache/URL, MEDIUM per SEO.

**Test:** rigenerazione immagine, cache vecchia/nuova, Googlebot vs browser, sitemap, canonical, share preview e link `/photo/:id`.

## Fase 9 — Hardening, asset e cleanup finale

**Obiettivo:** chiudere il debito secondario.

**Interventi:**

- error response tipizzate;
- origin esatte e rate limit distribuito;
- security headers/CSP;
- font subset;
- Leaflet CSS route-specific;
- source map policy;
- dead code;
- migrazione CRA→Vite come PR separata.

**Perché ora:** CSP e cleanup diventano più semplici dopo aver stabilizzato asset e architettura.

**Rischio regressioni:** LOW/MEDIUM; Vite MEDIUM.

**Test:** login/sessione, CORS, upload diretto, font rendering, mappe, build/deploy Vercel e deep link SPA.
