import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PhotoProvider, usePhotos } from './contexts/PhotoContext';
import Header from './components/Header';
import Hero from './components/Hero';
import WorldMap from './components/WorldMap';
import Gallery from './components/Gallery';
import PhotoModal from './components/PhotoModal';
import PhotoUpload from './components/PhotoUpload';
import Footer from './components/Footer';
import ToastProvider, { useToast } from './components/Toast';
import GlobalStyles from './styles/GlobalStyles';
import './styles/leaflet-custom.css';

// Componente interno che usa il PhotoContext
function AppContent() {
  const [showUpload, setShowUpload] = useState(false);
  const { actions } = usePhotos();
  const toast = useToast();

  const handleUploadSuccess = async (newPhoto) => {
    setShowUpload(false);
    toast.success('Foto caricata con successo! 📸');
    console.log('Foto caricata con successo:', newPhoto);
  };

  const handleUploadError = (error) => {
    toast.error(`Errore durante il caricamento: ${error.message || error}`);
  };

  return (
    <Router>
      <GlobalStyles />
      <div className="App">
        <Header onOpenUpload={() => setShowUpload(true)} />
        <main>
          <Routes>
            <Route path="/" element={
              <>
                <Hero />
                <section id="mappa">
                  <WorldMap />
                </section>
                <section id="galleria">
                  <Gallery />
                </section>
              </>
            } />
          </Routes>
        </main>
        <Footer />
        <PhotoModal />
        {showUpload && (
          <PhotoUpload 
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
            onClose={() => setShowUpload(false)}
          />)
        }
        <ToastProvider toasts={toast.toasts} onRemove={toast.removeToast} />
      </div>
    </Router>
  );
}

function App() {
  return (
    <PhotoProvider>
      <AppContent />
    </PhotoProvider>
  );
}

export default App;
