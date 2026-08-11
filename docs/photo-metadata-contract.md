# Contratto dei metadata fotografici

La source of truth applicativa è `packages/photo-metadata-contract`. La migration
SQL corrente resta esplicita: il contratto non genera schema, form o migration.
Ogni consumer obbligatorio dichiara i campi gestiti e le esclusioni motivate;
le dichiarazioni sono elenchi espliciti e indipendenti dal catalogo. I test le
confrontano sia con il contratto sia, dove possibile, con le forme realmente
prodotte da sanitizer, mapping Postgres, proiezione API e form state.

## Semantica comune

- In una patch, `undefined` significa **non modificare**.
- Per le stringhe opzionali, `""` significa **valore intenzionalmente vuoto**.
- I campi stringa non sono nullable: un `null` esplicito è invalido, non viene
  convertito silenziosamente in stringa vuota.
- Il titolo è obbligatorio e contiene da 3 a 120 caratteri.
- Le coordinate sono una coppia: entrambe `NULL` se mancanti, entrambe numeriche
  se presenti. `(0, 0)` è una coordinata valida e non è un fallback.
- I tag sono stringhe non vuote, uniche senza distinzione di maiuscole, massimo
  20 elementi e 40 caratteri ciascuno. Un input eccedente viene rifiutato: non
  viene mai troncato o deduplicato silenziosamente.
- `settings` conserva l’oggetto intero. `aperture`, `shutter`, `iso` e `focal`
  sono editabili; `cropProfiles` appartiene al lifecycle dei crop; chiavi EXIF o
  vendor sconosciute devono sopravvivere al round-trip.
- Titolo, luogo, data e coordinate mancanti non vengono inventati. I fallback
  di presentazione, quando utili, appartengono esclusivamente alla UI.
- Il wizard propone la data odierna soltanto alla creazione, preservando la UX
  precedente. È un valore di form modificabile: backend, import e persistenza
  non generano una data di scatto quando manca.

## Matrice campo → ownership e consumer

| Campo | Owner | Null/vuoto | Edit admin | Persistenza/API | Audit/pubblico |
|---|---|---|---|---|---|
| `id` | Database/intent | mai null | no | BIGINT, API | snapshot audit, URL pubblico |
| `title` | Editoriale | richiesto, 3–120 | sì | `title`, API | audit, modal e SEO |
| `description` | Editoriale | stringa vuota, max 4000 | sì | `description`, API | audit, modal e SEO |
| `date` | Editoriale/EXIF | stringa vuota, max 40 | sì | `date_taken`, API | audit, modal e SEO |
| `location` | Editoriale/EXIF | stringa vuota, max 160 | sì | `location_name`, API | audit, modal e SEO |
| `lat` / `lng` | Editoriale/EXIF | coppia nullable; zero valido | sì | colonne nullable, API | audit; mappa, non testo modal |
| `camera` / `lens` | Editoriale/EXIF | stringa vuota, max 120 | sì | colonne dedicate, API | audit e modal |
| `resolution` | Sharp | stringa vuota, max 120 | no | aggiornata col media lifecycle | audit e modal |
| `settings` | Misto | oggetto, max 65536 caratteri JSON | parziale | JSONB e snapshot intero | audit e modal tecnico |
| `tags` | Editoriale | array, max 20 × 40 | sì | `TEXT[]`, API e snapshot | audit, modal e SEO |
| `createdAt` | Database/intent | nullable nei vecchi snapshot | no | `created_at`, API | audit; non è data scatto |
| `updatedAt` | Clock del service | mai null nel DB | no | `updated_at_ms`, API | audit amministrativo |
| `version` | Database | positivo | no | optimistic concurrency, API | audit tecnico |
| `derivativesVersion` | Media lifecycle | positivo | no | DB e API | cache/versionamento asset |
| `mediaGeneration` | Media lifecycle | vuoto solo prima del media | no | DB e API | ownership asset |
| `assets` | Registro asset | inventario esplicito | no | relazione Postgres, forma API | URL pubblici; audit snapshot |

## Consumer obbligatori

Backend: validazione, persistenza Postgres, adapter JSON temporaneo,
import/export, serializzazione API, create/patch, audit e replace-source/media.
Frontend: form admin, dettaglio pubblico, pagina SEO e marker del globo. Un
consumer può escludere un campo soltanto dichiarando una motivazione non vuota.
Le dichiarazioni non devono usare `PHOTO_METADATA_FIELD_KEYS`,
`PHOTO_EDITABLE_FIELD_KEYS` o liste derivate equivalenti per auto-compilarsi:
ciò renderebbe circolare il controllo anti-dimenticanza.

Il repository Postgres rivalida i campi editoriali anche se il chiamante non è
una route. Import e verifica snapshot usano lo stesso contratto. L’adapter JSON
resta temporaneo e dichiarato; non autorizza conversioni legacy nel normale
runtime Postgres. Le conversioni storiche appartengono solo al tooling di
migrazione e vanno eliminate con l’adapter dopo il cutover.

Per uno snapshot storico privo di `createdAt`, l’import assegna esplicitamente
il timestamp dell’import: non viene derivato dall’ID e non viene confuso con la
data dello scatto. Gli export successivi lo preservano.

### Confini di enforcement

- Il database garantisce tipi e nullabilità strutturale, lunghezze delle colonne,
  range delle coordinate, coppia `lat`/`lng`, conteggio massimo dei tag e
  concorrenza tramite `version`.
- Il domain/repository layer garantisce titolo obbligatorio, tipo delle stringhe,
  unicità e lunghezza dei singoli tag, dimensione serializzata di `settings` e
  rifiuto dei campi read-only nei payload editoriali.
- Il frontend deriva limiti e messaggi dal contratto per feedback immediato, ma
  non è mai considerato un confine di sicurezza.
- Sharp, lifecycle media e registro asset restano autorità per campi derivati e
  read-only; non vengono accettati come metadata editoriali.
- L’API usa un allowlist esplicito e validato contro `public`. Non effettua mai
  lo spread dell’intero record repository: proprietà interne o sconosciute
  restano escluse, e un campo `public: false` non può entrare nell’allowlist.

## Modificare il contratto

### Aggiungere un campo

1. Aggiungerlo a `PHOTO_METADATA_FIELDS`, definendo owner, editabilità,
   nullabilità, visibilità e limiti.
2. Eseguire i test: ogni consumer obbligatorio fallirà finché non dichiara
   gestione o esclusione motivata. Aggiornare gli elenchi espliciti soltanto
   dopo aver implementato il relativo mapping, form o comportamento.
3. Se persistito, aggiungere una nuova migration SQL e aggiornare mapping,
   insert/patch e verifica post-import. Non modificare migration già applicate.
4. Aggiornare sanitizer/create/patch; poi snapshot/import/API/audit.
5. Se editabile, aggiornare il form e i suoi test; se pubblico, decidere
   esplicitamente modal e SEO.
6. Aggiungere un round-trip Postgres e aggiornare questa matrice.

### Rinominare o deprecare

Non mantenere due nomi nel runtime. Introdurre il nuovo campo e una migration
dati esplicita; il vecchio nome può essere letto solo dallo strumento temporaneo
di migrazione. Dopo che il preflight conferma zero record vecchi, rimuovere
campo, conversione e colonna con un commit separato.

### Rimuovere

Prima rendere esplicita l’esclusione in tutti i consumer e migrare/esportare i
dati necessari. Poi rimuovere consumer, campo dal contratto e colonna con una
nuova migration. I test di copertura falliscono se resta un riferimento al
campo eliminato.

## Verifica

```bash
cd backend && npm test
cd frontend && CI=true npm test -- --watchAll=false
npm run build
```

I test di mutazione aggiungono un campo fittizio e ne rimuovono uno per
verificare che copertura incompleta e riferimenti obsoleti falliscano.
