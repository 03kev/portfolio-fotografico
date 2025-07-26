const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const Photo = require('../models/Photo');

const router = express.Router();

// Configurazione multer per upload immagini
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo file di immagine sono consentiti'), false);
    }
  }
});

// GET - Ottieni tutte le foto
router.get('/', async (req, res) => {
  try {
    // Per ora usiamo dati mock, poi potrai integrare con database
    const mockPhotos = [
      {
        id: 1,
        title: "Tramonto in Toscana",
        location: "Val d'Orcia, Toscana, Italia",
        lat: 43.0759,
        lng: 11.6776,
        image: "/uploads/toscana.jpg",
        thumbnail: "/uploads/thumbnails/toscana_thumb.jpg",
        description: "Un magnifico tramonto sui colli toscani durante la golden hour",
        date: "2024-06-15T18:30:00Z",
        camera: "Canon EOS R5",
        lens: "RF 24-70mm f/2.8L IS USM",
        settings: {
          aperture: "f/8",
          shutter: "1/125s",
          iso: "100",
          focal: "35mm"
        },
        tags: ["paesaggio", "tramonto", "toscana", "natura"]
      },
      {
        id: 2,
        title: "Aurora Boreale Lofoten",
        location: "Isole Lofoten, Norvegia",
        lat: 68.0851,
        lng: 13.6093,
        image: "/uploads/aurora.jpg",
        thumbnail: "/uploads/thumbnails/aurora_thumb.jpg",
        description: "Spettacolare aurora boreale che danza sopra i fiordi norvegesi",
        date: "2024-03-20T23:45:00Z",
        camera: "Sony A7R IV",
        lens: "FE 16-35mm f/2.8 GM",
        settings: {
          aperture: "f/2.8",
          shutter: "15s",
          iso: "1600",
          focal: "16mm"
        },
        tags: ["aurora", "notturna", "norvegia", "natura"]
      },
      {
        id: 3,
        title: "Skyline Tokyo Notturno",
        location: "Shibuya, Tokyo, Giappone",
        lat: 35.6598,
        lng: 139.7006,
        image: "/uploads/tokyo.jpg",
        thumbnail: "/uploads/thumbnails/tokyo_thumb.jpg",
        description: "Il pulsante cuore di Tokyo illuminato dalle luci al neon",
        date: "2024-04-10T21:00:00Z",
        camera: "Fujifilm X-T5",
        lens: "XF 50-140mm f/2.8 R LM OIS WR",
        settings: {
          aperture: "f/4",
          shutter: "1/60s",
          iso: "800",
          focal: "85mm"
        },
        tags: ["urbano", "notturna", "tokyo", "luci"]
      },
      {
        id: 4,
        title: "Ghiacciaio Islandese",
        location: "Vatnajökull, Islanda",
        lat: 64.4208,
        lng: -16.8731,
        image: "/uploads/iceland.jpg",
        thumbnail: "/uploads/thumbnails/iceland_thumb.jpg",
        description: "Le infinite sfumature di blu del ghiacciaio più grande d'Europa",
        date: "2024-02-28T14:20:00Z",
        camera: "Nikon Z9",
        lens: "NIKKOR Z 24-120mm f/4 S",
        settings: {
          aperture: "f/11",
          shutter: "1/250s",
          iso: "200",
          focal: "50mm"
        },
        tags: ["ghiaccio", "paesaggio", "islanda", "natura"]
      },
      {
        id: 5,
        title: "Safari Serengeti",
        location: "Parco Nazionale Serengeti, Tanzania",
        lat: -2.3333,
        lng: 34.8333,
        image: "/uploads/safari.jpg",
        thumbnail: "/uploads/thumbnails/safari_thumb.jpg",
        description: "Leoni durante l'ora dorata nella savana africana",
        date: "2024-01-12T17:45:00Z",
        camera: "Canon EOS R6 Mark II",
        lens: "RF 100-500mm f/4.5-7.1L IS USM",
        settings: {
          aperture: "f/6.3",
          shutter: "1/500s",
          iso: "400",
          focal: "400mm"
        },
        tags: ["wildlife", "africa", "safari", "animali"]
      },
      {
        id: 6,
        title: "Montagne Rocciose",
        location: "Banff National Park, Canada",
        lat: 51.1784,
        lng: -115.5708,
        image: "/uploads/banff.jpg",
        thumbnail: "/uploads/thumbnails/banff_thumb.jpg",
        description: "Riflessi perfetti sul Lago Louise al sorgere del sole",
        date: "2024-05-05T06:30:00Z",
        camera: "Canon EOS R5",
        lens: "RF 15-35mm f/2.8L IS USM",
        settings: {
          aperture: "f/11",
          shutter: "1/15s",
          iso: "100",
          focal: "24mm"
        },
        tags: ["montagne", "lago", "canada", "riflessi"]
      }
    ];

    res.json({
      success: true,
      data: mockPhotos,
      total: mockPhotos.length
    });
  } catch (error) {
    console.error('Errore nel recupero foto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle foto'
    });
  }
});

// GET - Ottieni foto per ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Mock data per ora
    const mockPhotos = []; // Inserisci qui gli stessi dati mock di sopra
    const photo = mockPhotos.find(p => p.id === parseInt(id));
    
    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Foto non trovata'
      });
    }

    res.json({
      success: true,
      data: photo
    });
  } catch (error) {
    console.error('Errore nel recupero foto:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero della foto'
    });
  }
});

// POST - Upload nuova foto
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nessun file caricato'
      });
    }

    const { title, location, lat, lng, description, date, camera, lens, settings, tags } = req.body;

    // Genera nome file unico
    const timestamp = Date.now();
    const filename = `photo_${timestamp}.webp`;
    const thumbnailFilename = `photo_${timestamp}_thumb.webp`;

    // Processa l'immagine principale
    const processedImage = await sharp(req.file.buffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    // Crea thumbnail
    const thumbnail = await sharp(req.file.buffer)
      .resize(400, 300, { fit: 'cover' })
      .webp({ quality: 70 })
      .toBuffer();

    // Salva i file
    const uploadsDir = path.join(__dirname, '../../uploads');
    const thumbnailsDir = path.join(uploadsDir, 'thumbnails');

    // Crea directory se non esistono
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(thumbnailsDir, { recursive: true });

    await fs.writeFile(path.join(uploadsDir, filename), processedImage);
    await fs.writeFile(path.join(thumbnailsDir, thumbnailFilename), thumbnail);

    // Crea oggetto foto
    const newPhoto = {
      id: timestamp, // Usa timestamp come ID temporaneo
      title,
      location,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      image: `/uploads/${filename}`,
      thumbnail: `/uploads/thumbnails/${thumbnailFilename}`,
      description,
      date: date || new Date().toISOString(),
      camera,
      lens,
      settings: typeof settings === 'string' ? JSON.parse(settings) : settings,
      tags: typeof tags === 'string' ? JSON.parse(tags) : tags || []
    };

    res.status(201).json({
      success: true,
      message: 'Foto caricata con successo',
      data: newPhoto
    });

  } catch (error) {
    console.error('Errore nell\'upload:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'upload della foto'
    });
  }
});

// DELETE - Elimina foto
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Per ora solo mock response
    res.json({
      success: true,
      message: 'Foto eliminata con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nell\'eliminazione della foto'
    });
  }
});

module.exports = router;
