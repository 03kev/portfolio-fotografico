import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PhotoProvider } from './contexts/PhotoContext';
import Header from './components/Header';
import Hero from './components/Hero';
import WorldMap from './components/WorldMap';
import Gallery from './components/Gallery';
import PhotoModal from './components/PhotoModal';
import Footer from './components/Footer';
import GlobalStyles from './styles/GlobalStyles';
import './styles/leaflet-custom.css';

function App() {
  return (
    <PhotoProvider>
      <Router>
        <GlobalStyles />
        <div className="App">
          <Header />
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
        </div>
      </Router>
    </PhotoProvider>
  );
}

export default App;
