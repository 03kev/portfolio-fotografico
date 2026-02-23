import React from 'react';
import { useOutletContext } from 'react-router-dom';
import PhotoSeries from '../components/PhotoSeries';
import useSeo from '../seo/useSeo';

export default function SeriesPage() {
  useSeo({
    title: 'Serie Fotografiche',
    description: 'Serie fotografiche di Kevin Muka: progetti visivi organizzati per tema, luogo e narrazione.',
  });

  const { isAdmin } = useOutletContext();

  return (
    <PhotoSeries
      showAdmin={isAdmin}
      title="Serie"
      subtitle="Progetti coerenti: un filo narrativo, un luogo, un'idea."
    />
  );
}
