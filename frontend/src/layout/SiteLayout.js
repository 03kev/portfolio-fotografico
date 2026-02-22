import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import PhotoModal from '../components/PhotoModal';
import GalleryModal from '../components/GalleryModal';
import PhotoUpload from '../components/PhotoUpload';
import ToastProvider, { useToast } from '../components/Toast';
import useAdminMode from '../hooks/useAdminMode';
import { authService } from '../utils/api';

export default function SiteLayout() {
  const location = useLocation();
  const isAdminMode = useAdminMode();
  const toast = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [apiTokenConfigured, setApiTokenConfigured] = useState(false);
  const canEdit = isAdminMode && apiTokenConfigured;

  // Classic multi-page behavior: always start at top when changing route.
  // useLayoutEffect runs before paint, so you don't see the scroll movement / scrollbar flash.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previousScrollBehavior = html.style.scrollBehavior;
    // Override global `scroll-behavior: smooth` for this reset.
    html.style.scrollBehavior = 'auto';

    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // Some browsers use `documentElement`, others `body` as the scrolling element.
    window.scrollTo(0, 0);
    html.scrollTop = 0;
    document.body.scrollTop = 0;

    // Restore previous behavior on next frame.
    requestAnimationFrame(() => {
      html.style.scrollBehavior = previousScrollBehavior;
    });
  }, [location.key, location.pathname, location.search, location.hash]);

  const handleUploadSuccess = () => {
    setShowUpload(false);
    toast.success('Foto caricata con successo.');
  };

  const handleUploadError = (error) => {
    toast.error(`Errore durante il caricamento: ${error?.message || error}`);
  };

  useEffect(() => {
    let mounted = true;

    authService
      .getSession()
      .then((response) => {
        if (!mounted) return;
        setApiTokenConfigured(Boolean(response?.data?.authenticated));
      })
      .catch(() => {
        if (!mounted) return;
        setApiTokenConfigured(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canEdit && showUpload) {
      setShowUpload(false);
    }
  }, [canEdit, showUpload]);

  const handleConfigureApiToken = async () => {
    if (apiTokenConfigured) {
      try {
        await authService.logout();
        setApiTokenConfigured(false);
      } catch (error) {
        setApiTokenConfigured(false);
      }
      return;
    }

    const value = window.prompt(
      'Inserisci API token per aprire la sessione admin:'
    );

    if (value === null) return;

    const trimmed = value.trim();
    if (!trimmed) {
      setApiTokenConfigured(false);
      return;
    }

    try {
      await authService.login(trimmed);
      setApiTokenConfigured(true);
    } catch (error) {
      setApiTokenConfigured(false);
    }
  };

  return (
    <>
      <Header
        isAdmin={isAdminMode}
        onOpenUpload={canEdit ? () => setShowUpload(true) : undefined}
        onConfigureAuth={isAdminMode ? handleConfigureApiToken : undefined}
        hasAuthToken={apiTokenConfigured}
      />

      <main>
        <Outlet context={{ isAdmin: canEdit, isAdminMode }} />
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
