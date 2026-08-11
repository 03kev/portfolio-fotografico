# Riconciliazione degli inventari media R2

Questo strumento risolve esclusivamente il passaggio da uno snapshot storico
privo di `photo.assets` a uno snapshot canonico verificato. Non scrive o elimina
oggetti R2, non aggiorna Postgres e non sostituisce lo snapshot metadata
originale.

## Confini di sicurezza

- `PHOTO_DERIVATIVE_VARIANTS` non viene importato: il catalogo di produzione
  corrente non prova quali asset esistessero nello storico.
- Il reader R2 usa soltanto `ListObjectsV2` e `HeadObject` sui bucket e sul
  namespace configurati. `R2_BUCKET` e `R2_PRIVATE_BUCKET` devono essere
  entrambi espliciti: il bucket privato non ricade mai automaticamente su
  quello pubblico.
- Se pubblico e privato coincidono intenzionalmente, il bucket viene letto una
  sola volta e il report dichiara `sharedBucket: true`; altrimenti il valore è
  `false`.
- Una derivata può essere confermata soltanto da un path canonico
  `photos/<photoId>/<ULID>/<filename>` nel bucket pubblico.
- Una source può essere confermata soltanto da
  `source/photos/<photoId>/<ULID>/source.<ext>` nel bucket privato.
- La policy storica riconosciuta è congelata in
  `HISTORICAL_DERIVATIVE_FILES` dentro
  `mediaInventoryReconciliation.js`. Non va sostituita con il catalogo runtime.
- `full` è l’unico asset minimo obbligatorio per considerare la foto
  pubblicabile; l’assenza della source è segnalata, ma resta una warning del
  preflight corrente.
- Se più generazioni contengono una `full`, se più source sono plausibili, se
  il MIME non coincide, se un oggetto è vuoto o se compare un filename non
  riconosciuto nella generazione scelta, il caso è bloccante e nessun
  inventario viene inventato.

Gli oggetti classificati come orfani non vengono cancellati. Il termine indica
soltanto che non appartengono all’inventario attivo proposto. Nel report sono
distinte le vecchie copie non generazionali, gli oggetti senza una foto owner e
le generazioni canoniche non selezionate.

## Procedura read-only e backup

Verificare prima che `backend/.env` punti esplicitamente ai bucket e al namespace
desiderati. Per Production il namespace corrente è la root; una Preview deve
usare il suo prefisso isolato. Bucket pubblico, bucket privato, namespace e flag
di bucket condiviso formano la provenienza del run: vengono inclusi nel report,
nel manifest e nei checksum logici. Non riutilizzare un report prodotto per una
provenienza diversa.

Da `backend/`:

```bash
npm run metadata:reconcile-media -- \
  --output-dir ../.local/reconciliation-2026-08-11
```

La directory deve essere nuova. Lo strumento produce:

- `photos.source.backup.json` e `series.source.backup.json`: copia locale
  immutata dello snapshot letto;
- `photos.reconciled.proposed.json` e
  `series.reconciled.proposed.json`: proposta, mai caricata automaticamente;
- report JSON e Markdown;
- manifest con la provenienza e i checksum SHA-256 di sorgente, inventario R2,
  proposta e report.

Un secondo avvio con gli stessi input nella stessa directory è idempotente. Se
anche un solo file avrebbe contenuto diverso, l’esecuzione fallisce e richiede
una nuova directory: una review precedente non viene sovrascritta.

## Revisione obbligatoria

Prima di approvare:

1. controllare bucket, namespace e checksum nel report;
2. verificare `missingAssets`, `ambiguousCases`, `orphanObjects` e
   `unpublishablePhotos`;
3. revisionare tutte le modifiche per foto in `changes`;
4. confrontare a campione path, `photoId`, ruolo, scope, ULID e MIME con la
   console R2;
5. conservare la directory completa come backup della decisione.

La proposta è candidabile soltanto quando:

```text
ambiguousCases=0
unpublishablePhotos=0
cutoverPreflightReady=true
```

## Generazione sicura dello snapshot finale

Dopo la review, ripetere la lettura R2 passando il valore esatto del campo
logico `reportChecksum` mostrato dalla CLI e dal report JSON, e una directory
nuova:

```bash
npm run metadata:reconcile-media -- \
  --output-dir ../.local/reconciliation-approved-2026-08-11 \
  --approve-report-checksum <REPORT_CHECKSUM_LOGICO_APPROVATO>
```

`--approve-report-checksum` **non** accetta lo SHA-256 byte-per-byte ottenuto
con `shasum` sul report JSON o Markdown. Quel digest verifica un singolo file e
può dipendere dalla serializzazione; `reportChecksum` è invece calcolato sulla
rappresentazione canonica dei dati logici del report, inclusa la provenienza R2.
Il manifest distingue i due concetti con `reportChecksumKind` e con gli
eventuali `files.*.sha256`.

Lo strumento rigenera tutto dagli input reali. Se snapshot o inventario R2 sono
cambiati, il checksum non coincide e lo snapshot finale non viene emesso. Se
il report è ancora identico e pronto, vengono aggiunti
`photos.reconciled.json` e `series.reconciled.json`.

Eseguire poi il preflight obbligatorio sui file finali, senza importare:

```bash
node scripts/import-metadata-postgres.js \
  --photos ../.local/reconciliation-approved-2026-08-11/photos.reconciled.json \
  --series ../.local/reconciliation-approved-2026-08-11/series.reconciled.json \
  --cutover-preflight
```

Il comando deve terminare con `missingAssetInventories=0, errors=0`. Soltanto
dopo una review separata questi file potranno diventare input dello staging
import. Questa procedura non carica metadata su R2 e non tocca Production.

## Manutenzione e rimozione

La grammatica storica è intenzionalmente specifica per questo cutover. Un nuovo
ruolo runtime non va aggiunto automaticamente. Se un oggetto storico con un
nuovo filename deve essere riconciliato, servono evidenza documentata, un test
e una nuova versione dello schema di riconciliazione.

Rimuovere tool, policy storica e relativa documentazione dopo il cutover
Postgres, la verifica post-import e la scadenza della finestra di rollback JSON.
