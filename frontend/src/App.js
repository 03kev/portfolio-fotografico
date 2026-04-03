import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';

import { PhotoProvider } from './contexts/PhotoContext';
import { SeriesProvider } from './contexts/SeriesContext';

import GlobalStyles from './styles/GlobalStyles';
import appTheme from './styles/theme';
import './styles/leaflet-custom.css';

import SiteLayout from './layout/SiteLayout';

import HomePage from './pages/HomePage';
import SeriesPage from './pages/SeriesPage';
import GalleryPage from './pages/GalleryPage';
import PhotoPage from './pages/PhotoPage';
import MapPage from './pages/MapPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import NotFoundPage from './pages/NotFoundPage';
import AdminAccessPage from './pages/AdminAccessPage';

import SeriesDetail from './components/SeriesDetail';

export default function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <PhotoProvider>
        <SeriesProvider>
          <Router>
            <GlobalStyles />
            <Routes>
              <Route element={<SiteLayout />}> 
                <Route path="/admin" element={<AdminAccessPage />} />
                <Route path="/admin/logout" element={<AdminAccessPage />} />
                <Route path="/admin/logout/*" element={<AdminAccessPage />} />
                <Route path="/" element={<HomePage />} />
                <Route path="/series" element={<SeriesPage />} />
                <Route path="/series/:slug" element={<SeriesDetail />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/photo/:id" element={<PhotoPage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Router>
        </SeriesProvider>
      </PhotoProvider>
    </ThemeProvider>
  );
}
