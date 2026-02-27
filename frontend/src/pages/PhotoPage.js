import React from 'react';
import { useParams } from 'react-router-dom';
import Gallery from '../components/Gallery';
import useSeo from '../seo/useSeo';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

function toAbsoluteUrl(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;

  const base = (process.env.REACT_APP_SITE_URL || window.location.origin || '').replace(/\/+$/, '');
  const resolved = `${IMAGES_BASE_URL}${src}`;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  return `${base}${resolved.startsWith('/') ? resolved : `/${resolved}`}`;
}

export default function PhotoPage() {
  const { id } = useParams();
  const { photos, loading } = usePhotos();
  const photoId = String(id || '').trim();
  const siteBase = (process.env.REACT_APP_SITE_URL || window.location.origin || '').replace(/\/+$/, '');
  const canonicalUrl = `${siteBase}/photo/${encodeURIComponent(photoId)}`;

  const photo = React.useMemo(
    () => photos.find((item) => String(item.id) === photoId) || null,
    [photos, photoId]
  );

  const seoTitle = photo?.title
    ? `${photo.title} - Kevin Muka`
    : 'Foto - Kevin Muka';

  const seoDescription = photo
    ? (photo.description || `Foto "${photo.title || 'senza titolo'}" scattata in ${photo.location || 'luogo non specificato'}.`)
    : 'Dettaglio foto nell\'archivio fotografico di Kevin Muka.';

  const seoImage = photo ? toAbsoluteUrl(photo.image || photo.url || photo.thumbnail) : '';
  const keywords = React.useMemo(
    () => (Array.isArray(photo?.tags) ? photo.tags.filter(Boolean) : []),
    [photo]
  );
  const keywordsCsv = React.useMemo(() => keywords.join(', '), [keywords]);

  const structuredData = React.useMemo(() => {
    if (!photo) return null;

    const data = {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      name: photo.title || 'Fotografia',
      description: photo.description || photo.location || 'Scatto fotografico',
      contentUrl: toAbsoluteUrl(photo.image || photo.url || photo.thumbnail),
      url: canonicalUrl,
    };

    if (keywordsCsv) {
      data.keywords = keywordsCsv;
    }

    if (photo.date) {
      data.datePublished = photo.date;
    }

    return data;
  }, [photo, canonicalUrl, keywordsCsv]);

  useSeo({
    title: seoTitle,
    prependBrand: false,
    description: seoDescription,
    ogType: 'article',
    image: seoImage,
    keywords: keywordsCsv,
    noindex: !loading && !photo,
    structuredData,
  });

  return <Gallery headingLevel="h1" forcedPhotoId={photoId} />;
}
