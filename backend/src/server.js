const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const photoRoutes = require('./routes/photos');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware di sicurezza
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100 // limite di 100 richieste per finestra per IP
});
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://tuodominio.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servire file statici (immagini)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/photos', photoRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    message: error.message || 'Errore interno del server',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint non trovato' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server in esecuzione su porta ${PORT}`);
  console.log(`📸 Portfolio API pronta su http://localhost:${PORT}/api`);
});

module.exports = app;
