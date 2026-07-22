import React from 'react';
import Gallery from '../components/Gallery';
import useSeo from '../seo/useSeo';

export default function GalleryPage() {
  useSeo({
    title: 'Archivio Fotografico',
    description: 'Archivio fotografico completo di Kevin Muka, filtrabile per tag, luogo, titolo e descrizione.'
  });

  return <Gallery headingLevel="h1" />;
}
