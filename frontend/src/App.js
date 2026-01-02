import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { PhotoProvider } from './contexts/PhotoContext';
import { SeriesProvider } from './contexts/SeriesContext';

import GlobalStyles from './styles/GlobalStyles';
import './styles/leaflet-custom.css';

import SiteLayout from './layout/SiteLayout';

import HomePage from './pages/HomePage';
import SeriesPage from './pages/SeriesPage';
import GalleryPage from './pages/GalleryPage';
import MapPage from './pages/MapPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import NotFoundPage from './pages/NotFoundPage';

import SeriesDetail from './components/SeriesDetail';

export default function App() {
  return (
    <PhotoProvider>
      <SeriesProvider>
        <Router>
          <GlobalStyles />
          <Routes>
            <Route element={<SiteLayout />}> 
              <Route path="/" element={<HomePage />} />
              <Route path="/series" element={<SeriesPage />} />
              <Route path="/series/:slug" element={<SeriesDetail />} />
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Router>
      </SeriesProvider>
    </PhotoProvider>
  );
}
