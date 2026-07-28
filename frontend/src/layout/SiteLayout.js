import React, { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import PhotoModal from '../components/PhotoModal';
import GalleryModal from '../components/GalleryModal';
import ToastProvider, { useToast } from '../components/Toast';
import { LazyAdminTokenModal, LazyPhotoUpload } from '../components/lazyAdminComponents';
import useAdminMode from '../hooks/useAdminMode';
import { authService } from '../utils/api';

export default function SiteLayout() {
  const location = useLocation();
  const isAdminMode = useAdminMode();
  const toast = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [apiTokenConfigured, setApiTokenConfigured] = useState(false);
  const [authSessionResolved, setAuthSessionResolved] = useState(false);
  const [authFeedback, setAuthFeedback] = useState('idle');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalLoading, setAuthModalLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState('');
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
    toast.error(error?.message || 'Caricamento non riuscito.');
  };

  useEffect(() => {
    let mounted = true;

    authService
      .getSession()
      .then((response) => {
        if (!mounted) return;
        setApiTokenConfigured(Boolean(response?.data?.authenticated));
        setAuthSessionResolved(true);
      })
      .catch(() => {
        if (!mounted) return;
        setApiTokenConfigured(false);
        setAuthSessionResolved(true);
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

  useEffect(() => {
    if (authFeedback === 'idle') return;
    const timer = setTimeout(() => setAuthFeedback('idle'), 1400);
    return () => clearTimeout(timer);
  }, [authFeedback]);

  const handleConfigureApiToken = async () => {
    if (apiTokenConfigured) {
      try {
        await authService.logout();
        setApiTokenConfigured(false);
        setAuthFeedback('idle');
        toast.info('Sessione admin disattivata.');
      } catch (error) {
        setApiTokenConfigured(false);
        setAuthFeedback('idle');
      }
      return;
    }

    setAuthModalError('');
    setShowAuthModal(true);
  };

  const handleCloseAuthModal = () => {
    if (authModalLoading) return;
    setShowAuthModal(false);
    setAuthModalError('');
  };

  const handleSubmitAuthModal = async (token) => {
    const trimmed = String(token || '').trim();
    if (!trimmed) {
      setAuthModalError('Inserisci un token valido.');
      return;
    }

    setAuthModalLoading(true);
    setAuthModalError('');
    try {
      await authService.login(trimmed);
      setApiTokenConfigured(true);
      setAuthFeedback('success');
      setShowAuthModal(false);
      toast.success('Sessione admin attiva.');
    } catch (error) {
      setApiTokenConfigured(false);
      setAuthFeedback('error');
      setAuthModalError('Token non valido o sessione non autorizzata.');
    } finally {
      setAuthModalLoading(false);
    }
  };

  return (
    <>
      <Header
        isAdmin={isAdminMode}
        onOpenUpload={canEdit ? () => setShowUpload(true) : undefined}
        onConfigureAuth={isAdminMode ? handleConfigureApiToken : undefined}
        hasAuthToken={apiTokenConfigured}
        authFeedback={authFeedback}
      />

      <main>
        <Outlet
          context={{
            isAdmin: canEdit,
            isAdminMode,
            isAdminSessionPending: !authSessionResolved,
            notify: {
              success: toast.success,
              error: toast.error,
              warning: toast.warning,
              info: toast.info
            }
          }}
        />
      </main>

      <Footer />

      <PhotoModal />
      <GalleryModal />

      {showUpload && (
        <Suspense fallback={null}>
          <LazyPhotoUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
            onClose={() => setShowUpload(false)}
          />
        </Suspense>
      )}

      {isAdminMode && showAuthModal && (
        <Suspense fallback={null}>
          <LazyAdminTokenModal
            isOpen
            loading={authModalLoading}
            error={authModalError}
            onClose={handleCloseAuthModal}
            onSubmit={handleSubmitAuthModal}
          />
        </Suspense>
      )}

      <ToastProvider toasts={toast.toasts} onRemove={toast.removeToast} />
    </>
  );
}
