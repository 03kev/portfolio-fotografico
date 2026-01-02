# Sistema Serie Fotografiche

## 📸 Panoramica

Sistema completo per creare e gestire serie fotografiche nel portfolio con:
- **Creazione manuale** delle serie (non più basate su tag)
- **Pagine dedicate** per ogni serie
- **Editor visuale** per organizzare foto e testo
- **Gestione completa** di contenuti misti (foto + paragrafi)

## 🎯 Funzionalità

### 1. Creazione Serie
- Click su "Nuova Serie" nella sezione serie
- Compila titolo e descrizione
- Seleziona le foto da includere
- Scegli se pubblicare subito o salvare come bozza

### 2. Organizzazione Contenuti
Puoi aggiungere diversi tipi di contenuto:
- **📝 Paragrafi**: Per raccontare la storia dietro le foto
- **📷 Gruppi Foto**: Per organizzare le foto in sezioni tematiche

### 3. Modalità Edit
Ogni serie ha un pulsante "Modifica" che permette di:
- Modificare titolo e descrizione
- Aggiungere/rimuovere foto
- Riorganizzare i contenuti
- Pubblicare/nascondere la serie

## 🗂️ Struttura File

### Backend
- `backend/src/models/Series.js` - Modello dati per le serie
- `backend/src/routes/series.js` - API endpoints per CRUD
- `backend/data/series.json` - Database delle serie

### Frontend
- `frontend/src/contexts/SeriesContext.js` - Context per gestione stato
- `frontend/src/components/PhotoSeries.js` - Lista delle serie
- `frontend/src/components/SeriesDetail.js` - Pagina singola serie
- `frontend/src/components/SeriesEditor.js` - Editor serie

## 🚀 Come Usare

### Creare una nuova serie:
1. Vai alla sezione "Serie Fotografiche"
2. Click su "+ Nuova Serie"
3. Compila il form:
   - Titolo (obbligatorio)
   - Descrizione (obbligatorio)
   - Seleziona le foto
   - Aggiungi paragrafi o gruppi foto
4. Spunta "Pubblica" per renderla visibile
5. Click "Crea Serie"

### Modificare una serie:
1. Apri la pagina della serie (click sulla card)
2. Click su "✏️ Modifica"
3. Apporta le modifiche
4. Click "Aggiorna Serie"

### Eliminare una serie:
1. Modifica la serie
2. (Funzione da aggiungere tramite API DELETE)

## 🎨 Struttura Dati

```javascript
{
  "id": "1234567890",
  "title": "Titolo Serie",
  "slug": "titolo-serie",
  "description": "Descrizione della serie",
  "coverImage": "photo_id", // Opzionale
  "photos": ["photo_id_1", "photo_id_2"],
  "content": [
    {
      "type": "text",
      "content": "Testo del paragrafo...",
      "order": 0
    },
    {
      "type": "photos",
      "content": ["photo_id_1", "photo_id_2"],
      "order": 1
    }
  ],
  "published": true,
  "createdAt": "2026-01-02T...",
  "updatedAt": "2026-01-02T..."
}
```

## 🔗 API Endpoints

- `GET /api/series` - Ottieni tutte le serie (solo pubblicate)
- `GET /api/series?all=true` - Ottieni tutte le serie (anche bozze)
- `GET /api/series/:slug` - Ottieni serie specifica
- `POST /api/series` - Crea nuova serie
- `PUT /api/series/:id` - Aggiorna serie
- `DELETE /api/series/:id` - Elimina serie
- `POST /api/series/:id/photos/:photoId` - Aggiungi foto
- `DELETE /api/series/:id/photos/:photoId` - Rimuovi foto

## 📱 Routing

- `/` - Homepage con sezione serie
- `/series/:slug` - Pagina dedicata della serie

## 🎯 Prossimi Miglioramenti

- [ ] Drag & drop per riordinare contenuti
- [ ] Immagine di copertina personalizzata
- [ ] Categorie per le serie
- [ ] Condivisione social
- [ ] SEO ottimizzato per ogni serie
- [ ] Statistiche visualizzazioni
