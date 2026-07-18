import React from 'react';
import Gallery from '../components/Gallery';
import useSeo from '../seo/useSeo';
import { usePhotos } from '../contexts/PhotoContext';
import { toAbsoluteImageUrl, toAbsoluteSiteUrl } from '../utils/siteUrl';

export default function GalleryPage() {
  const { photos } = usePhotos();

  const imageStructuredData = React.useMemo(() => {
    const galleryImages = photos
      .slice(0, 120)
      .map((photo) => {
        const full = toAbsoluteImageUrl(photo.image, photo.derivativesVersion || photo.updatedAt || photo.id);
        if (!full) return null;

        const landingUrl = toAbsoluteSiteUrl(`/photo/${encodeURIComponent(String(photo.id))}`);
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
      url: toAbsoluteSiteUrl('/gallery'),
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
