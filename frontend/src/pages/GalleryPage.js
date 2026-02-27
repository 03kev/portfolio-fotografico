import React from 'react';
import Gallery from '../components/Gallery';
import useSeo from '../seo/useSeo';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

export default function GalleryPage() {
  const { photos } = usePhotos();

  const imageStructuredData = React.useMemo(() => {
    const toAbsolute = (value) => {
      const src = String(value || '').trim();
      if (!src) return '';
      if (/^https?:\/\//i.test(src)) return src;

      const base = (process.env.REACT_APP_SITE_URL || window.location.origin || '').replace(/\/+$/, '');
      const resolved = `${IMAGES_BASE_URL}${src}`;
      if (/^https?:\/\//i.test(resolved)) return resolved;
      return `${base}${resolved.startsWith('/') ? resolved : `/${resolved}`}`;
    };

    const galleryImages = photos
      .slice(0, 120)
      .map((photo) => {
        const full = toAbsolute(photo.image);
        if (!full) return null;

        const landingUrl = `${(process.env.REACT_APP_SITE_URL || window.location.origin || '').replace(/\/+$/, '')}/photo/${encodeURIComponent(String(photo.id))}`;
        const data = {
          '@type': 'ImageObject',
          contentUrl: full,
          url: landingUrl,
          name: photo.title || 'Fotografia',
          description: photo.description || photo.location || 'Scatto fotografico'
        };

        if (Array.isArray(photo.tags) && photo.tags.length > 0) {
          data.keywords = photo.tags.filter(Boolean).join(', ');
        }

        return data;
      })
      .filter(Boolean);

    return {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: 'Archivio Fotografico - Kevin Muka',
      url: `${(process.env.REACT_APP_SITE_URL || window.location.origin || '').replace(/\/+$/, '')}/gallery`,
      associatedMedia: galleryImages
    };
  }, [photos]);

  useSeo({
    title: 'Archivio Fotografico',
    description: 'Archivio fotografico completo di Kevin Muka, filtrabile per tag, luogo, titolo e descrizione.',
    structuredData: imageStructuredData,
  });

  return <Gallery headingLevel="h1" />;
}
