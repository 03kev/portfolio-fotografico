import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { MotionConfig } from 'framer-motion';

import { PhotoProvider } from './contexts/PhotoContext';
import { SeriesProvider } from './contexts/SeriesContext';

import GlobalStyles from './styles/GlobalStyles';
import appTheme from './styles/theme';
import './styles/leaflet-custom.css';

import SiteLayout from './layout/SiteLayout';

const HomePage = lazy(() => import('./pages/HomePage'));
const SeriesPage = lazy(() => import('./pages/SeriesPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const PhotoPage = lazy(() => import('./pages/PhotoPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const RightsPage = lazy(() => import('./pages/RightsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AdminAccessPage = lazy(() => import('./pages/AdminAccessPage'));
const SeriesDetail = lazy(() => import('./components/SeriesDetail'));

const RouteFallback = () => null;

export default function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <MotionConfig reducedMotion="user">
        <PhotoProvider>
          <SeriesProvider>
            <Router>
              <GlobalStyles />
              <Suspense fallback={<RouteFallback />}>
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
                    <Route path="/rights" element={<RightsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </SeriesProvider>
        </PhotoProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
