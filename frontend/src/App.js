import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PhotoProvider, usePhotos } from './contexts/PhotoContext';
import Header from './components/Header';
import Hero from './components/Hero';
import WorldMap from './components/WorldMap';
import Gallery from './components/Gallery';
import PhotoModal from './components/PhotoModal';
import GalleryModal from './components/GalleryModal';
import PhotoUpload from './components/PhotoUpload';
import Footer from './components/Footer';
import ToastProvider, { useToast } from './components/Toast';
import GlobalStyles from './styles/GlobalStyles';
import './styles/leaflet-custom.css';

// Componente interno che usa il PhotoContext
function AppContent() {
    const [showUpload, setShowUpload] = useState(false);
    const toast = useToast();
    
    useEffect(() => {
        // Salva la posizione di scroll prima del refresh
        const saveScroll = () => {
            localStorage.setItem('scrollY', window.scrollY);
        };
        window.addEventListener('beforeunload', saveScroll);
        
        // Disabilita scroll restoration
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
        
        setTimeout(() => {
            // Prova a ripristinare la posizione di scroll salvata
            const savedY = parseInt(localStorage.getItem('scrollY'), 10);
            const windowHeight = window.innerHeight;
            const mappaThreshold = windowHeight * 0.8;
            const galleriaThreshold = windowHeight * 1.8;
            if (!isNaN(savedY)) {
                // Scrolla alla posizione esatta
                window.scrollTo({ top: savedY, behavior: 'auto' });
                // Se vuoi invece scrollare alla sezione, puoi decommentare qui sotto:
                if (savedY < mappaThreshold) {
                    window.scrollTo({ top: 0, behavior: 'auto' });
                } else if (savedY < galleriaThreshold) {
                    const mappaEl = document.querySelector('#world-map-3d');
                    if (mappaEl) mappaEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                } else {
                    const galleriaEl = document.querySelector('#gallery');
                    if (galleriaEl) galleriaEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
                localStorage.removeItem('scrollY');
            }
        }, 100);
        
        return () => {
            window.removeEventListener('beforeunload', saveScroll);
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'auto';
            }
        };
    }, []);
    
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
        <GalleryModal />
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
