import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import PhotoModal from '../components/PhotoModal';
import GalleryModal from '../components/GalleryModal';
import PhotoUpload from '../components/PhotoUpload';
import ToastProvider, { useToast } from '../components/Toast';
import useAdminMode from '../hooks/useAdminMode';

export default function SiteLayout() {
  const location = useLocation();
  const isAdmin = useAdminMode();
  const toast = useToast();
  const [showUpload, setShowUpload] = useState(false);

  // Classic multi-page behavior: always start at top when changing route
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const handleUploadSuccess = () => {
    setShowUpload(false);
    toast.success('Foto caricata con successo.');
  };

  const handleUploadError = (error) => {
    toast.error(`Errore durante il caricamento: ${error?.message || error}`);
  };

  return (
    <>
      <Header
        isAdmin={isAdmin}
        onOpenUpload={isAdmin ? () => setShowUpload(true) : undefined}
      />

      <main>
        <Outlet context={{ isAdmin }} />
      </main>

      <Footer />

      <PhotoModal />
      <GalleryModal />

      {showUpload && (
        <PhotoUpload
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          onClose={() => setShowUpload(false)}
        />
      )}

      <ToastProvider toasts={toast.toasts} onRemove={toast.removeToast} />
    </>
  );
}
