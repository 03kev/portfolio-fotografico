# Export metadata Postgres per rollback JSON

Questo strumento produce uno snapshot canonico dei **soli metadata**. Non è un
backup completo del sistema: un rollback operativo deve coordinarlo con gli
asset già presenti in R2 e con la configurazione del medesimo namespace.

Lo script è offline ed esplicito. Non fa parte delle route applicative, non
legge né scrive R2 e non introduce conversioni legacy nel runtime.

## Contenuto canonico

`photos.json` contiene, nell’ordine canonico del repository:

- identità e metadata editoriali/tecnici della foto;
- `createdAt`, `updatedAt`, `version`, `derivativesVersion` e
  `mediaGeneration` esistenti;
- `settings` e tag con tipi e nullabilità del contratto corrente;
- esclusivamente l’inventario `assets` attivo del namespace richiesto, con
  ruolo, replacement group, scope, path, content type e generazione.

`series.json` contiene:

- identità, titolo, slug, descrizione, pubblicazione e timestamp;
- versione corrente;
- membership `photos` ordinata per `series_photos.position`;
- `coverImage`;
- documento editoriale `content` invariato.

Non vengono esportati audit event, creation intent, lease/operazioni media,
cleanup job, righe asset non attive, ID interni del registro, timestamp del
lifecycle degli asset, indici o stato delle sequence. Questi sono dati
operativi Postgres, non metadata canonici JSON.

## Precondizioni bloccanti

Prima dell’export:

1. disabilitare le scritture metadata sul deployment autorevole, attendere il
   redeploy e verificare indipendentemente una risposta reale
   `503 METADATA_READ_ONLY` da una route mutante autenticata e non distruttiva;
2. terminare o riconciliare ogni creation intent `pending`/`processing`;
3. terminare o abortire ogni operazione media ancora associata a una foto;
4. portare la coda cleanup in uno stato noto: nessun job `pending`,
   `processing` o `failed`;
5. verificare che nel database non esistano asset `planned` o `deleting`, anche
   in namespace diversi da quello esportato;
6. scegliere esplicitamente il namespace R2 che accompagnerà il rollback.

`METADATA_WRITES_ENABLED=false` nel processo locale è soltanto un gate che
autorizza l’esecuzione dello script. Non dimostra e non controlla il valore del
deployment Vercel. Il freeze remoto resta quindi una precondizione operativa
esterna, da registrare separatamente. Anche una transazione read-only produce
uno snapshot consistente soltanto al proprio istante: non impedisce a un altro
processo di scrivere durante o dopo l’export.

Lo strumento ripete questi controlli nella stessa transazione
`SERIALIZABLE READ ONLY DEFERRABLE` usata per leggere foto, serie, membership e
inventari. Fallisce inoltre se trova asset attivi fuori dal namespace scelto,
se manca una `full`, se il registro non coincide con lo snapshot o se un
contratto canonico non è valido.

Nella medesima transazione, prima di leggere lo stato applicativo, confronta
inoltre `current_database()` e l’identità Neon esposta dalla connessione con i
valori attesi dichiarati dall’operatore. Un database diverso, un branch diverso
o un’identità Neon non disponibile interrompono l’esecuzione prima che venga
creata la directory di output.

Gli intent `completed`, i job `succeeded`/`cancelled` e gli asset
`retired`/`deleted` sono tombstone o storia operativa: vengono conteggiati nel
report ma non entrano nei JSON.

## Esecuzione

Usare la connessione diretta del database autorevole e una directory nuova.
Non passare connection string sulla command line:

```bash
cd backend
METADATA_WRITES_ENABLED=false \
DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" \
npm run metadata:export-rollback -- \
  --object-namespace root \
  --expected-neon-branch-id br-xxxxxxxx \
  --expected-database-name portfolio_production \
  --output-dir ../.local/metadata-rollback-YYYY-MM-DD
```

`root` significa namespace vuoto. Per un namespace isolato indicare il valore
letterale, per esempio `preview/develop/smoke-...`.

L’output è idempotente: una seconda esecuzione può riutilizzare la directory
soltanto se ogni byte coincide. Un contenuto diverso richiede una directory
nuova, evitando di sovrascrivere un export già revisionato.

File prodotti:

- `photos.json` e `series.json`;
- report JSON e Markdown;
- manifest con provenance, checksum logici e checksum dei file.

Il checksum dello snapshot è calcolato sul JSON canonico, non sul layout a byte
del file. Database, branch Neon e namespace compaiono nel report senza
connection string o credenziali.

Il report e il manifest attestano l’identità verificata nella transazione, ma
dichiarano intenzionalmente `remoteApplicationFreeze.verifiedByExporter=false`:
non sostituiscono l’evidenza del deployment read-only e del relativo `503`.

## Verifica prima del rollback

1. conservare separatamente i file e il manifest;
2. verificare i checksum del manifest;
3. eseguire `metadata:validate` e il preflight sullo snapshot esportato;
4. caricare i file in un repository JSON isolato e confrontarne letture e
   serializzazione API con Postgres;
5. fare un reimport in un database vuoto e confrontare nuovamente foto, serie,
   membership, cover, content, versioni e asset;
6. verificare che gli oggetti R2 referenziati esistano ancora nello stesso
   namespace prima di cambiare backend.

Un rollback verso JSON non ripristina audit, intent o cleanup. Per questo deve
avvenire soltanto dopo il freeze delle scritture e la chiusura delle operazioni
in volo. Se una precondizione non è dimostrabile, non usare lo snapshot.

## Contratto del rollback JSON

Il rollback supportato è **inizialmente read-only**:

- distribuire i due file canonici insieme agli asset R2 dello stesso namespace;
- configurare `METADATA_BACKEND=json` e `METADATA_WRITES_ENABLED=false`;
- verificare letture repository, API e pagine pubbliche prima di qualsiasi
  ulteriore decisione.

Il round-trip coperto dai test preserva tutti i campi canonici di foto e serie,
versioni, ordine, membership, cover, contenuto e inventari asset. Non promette
scritture amministrative sicure sull’adapter JSON: abilitarle reintrodurrebbe le
race distribuite già caratterizzate e i nuovi flussi media richiedono Postgres.
Un eventuale rollback write-enabled richiede una decisione di rischio separata;
non è una capacità fornita da questo strumento.
