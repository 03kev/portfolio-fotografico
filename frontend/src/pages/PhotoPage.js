// Testo SEO per /photo/:id: aiuta i crawler a leggere contenuto specifico della foto
// senza mostrare alcun blocco visivo all'utente (evita il flash prima dell'apertura modal).

import React from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import Gallery from '../components/Gallery';
import useSeo from '../seo/useSeo';
import { usePhotos } from '../contexts/PhotoContext';
import { toAbsoluteImageUrl, toAbsoluteSiteUrl } from '../utils/siteUrl';
import { PHOTO_METADATA_PUBLIC_SEO_COVERAGE } from '../utils/photoMetadataModel';

void PHOTO_METADATA_PUBLIC_SEO_COVERAGE;

function buildPhotoDescription(photo) {
  if (!photo) {
    return 'Dettaglio foto nell\'archivio fotografico di Kevin Muka.';
  }

  const customDescription = String(photo.description || '').trim();
  if (customDescription) return customDescription;

  const title = String(photo.title || 'senza titolo').trim() || 'senza titolo';
  const location = String(photo.location || 'luogo non specificato').trim() || 'luogo non specificato';
  return `Foto "${title}" scattata in ${location}.`;
}

const SeoOnlyIntro = styled.section`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const PhotoTitle = styled.h1`
  margin: 0 0 8px 0;
  color: var(--color-text);
  font-size: clamp(1.8rem, 3.2vw, 2.4rem);
  line-height: 1.15;
`;

const PhotoMeta = styled.p`
  margin: 0 0 10px 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
`;

const PhotoDescription = styled.p`
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  max-width: 760px;
  line-height: 1.6;
`;

export default function PhotoPage() {
  const { id } = useParams();
  const { photos, loading, modalOpen, selectedPhoto, actions } = usePhotos();
  const photoId = String(id || '').trim();
  const openedPhotoIdRef = React.useRef(null);
  const canonicalUrl = toAbsoluteSiteUrl(`/photo/${encodeURIComponent(photoId)}`);

  const photo = React.useMemo(
    () => photos.find((item) => String(item.id) === photoId) || null,
    [photos, photoId]
  );

  React.useEffect(() => {
    if (loading || !photo) return;
    if (modalOpen && String(selectedPhoto?.id) === photoId) {
      openedPhotoIdRef.current = photoId;
      return;
    }
    if (openedPhotoIdRef.current === photoId) return;

    actions.openPhotoModal(photo);
    openedPhotoIdRef.current = photoId;
  }, [actions, loading, modalOpen, photo, photoId, selectedPhoto]);

  const seoTitle = photo?.title
    ? `${photo.title} - Kevin Muka`
    : 'Foto - Kevin Muka';

  const seoDescription = buildPhotoDescription(photo);

  const rightsUrl = toAbsoluteSiteUrl('/rights');
  const acquireLicensePage = toAbsoluteSiteUrl('/contact');
  const seoImage = photo ? toAbsoluteImageUrl(photo.assets?.social?.url) : '';
  const keywords = React.useMemo(
    () => (Array.isArray(photo?.tags) ? photo.tags.filter(Boolean) : []),
    [photo]
  );
  const keywordsCsv = React.useMemo(() => keywords.join(', '), [keywords]);

  const structuredData = React.useMemo(() => {
    if (!photo) return null;

    const imageObjectId = `${canonicalUrl}#primary-image`;
    const imageObject = {
      '@type': 'ImageObject',
      '@id': imageObjectId,
      name: photo.title || 'Fotografia',
      description: buildPhotoDescription(photo),
      contentUrl: toAbsoluteImageUrl(photo.assets?.full?.url),
      url: canonicalUrl,
      creator: { '@type': 'Person', name: 'Kevin Muka' },
      creditText: 'Kevin Muka',
      copyrightNotice: '© Kevin Muka. Tutti i diritti riservati.',
      license: rightsUrl,
      acquireLicensePage,
    };

    if (keywordsCsv) {
      imageObject.keywords = keywordsCsv;
    }

    if (photo.date) {
      imageObject.datePublished = photo.date;
    }

    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: seoTitle,
          description: seoDescription,
          primaryImageOfPage: { '@id': imageObjectId }
        },
        imageObject
      ]
    };
  }, [photo, canonicalUrl, keywordsCsv, rightsUrl, acquireLicensePage, seoDescription, seoTitle]);

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

  const visibleTitle = photo?.title || 'Foto';
  const visibleLocation = photo?.location || 'Luogo non specificato';
  const visibleDate = photo?.date || '';

  return (
    <>
      <SeoOnlyIntro>
          <PhotoTitle>{visibleTitle}</PhotoTitle>
          <PhotoMeta>
            {visibleLocation}
            {visibleDate ? ` - ${visibleDate}` : ''}
          </PhotoMeta>
          <PhotoDescription>{seoDescription}</PhotoDescription>
      </SeoOnlyIntro>
      <Gallery
        headingLevel="h2"
        hideCardDescriptions
      />
    </>
  );
}
