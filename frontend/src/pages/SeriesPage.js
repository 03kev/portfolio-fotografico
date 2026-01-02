import React from 'react';
import { useOutletContext } from 'react-router-dom';
import PhotoSeries from '../components/PhotoSeries';

export default function SeriesPage() {
  const { isAdmin } = useOutletContext();

  return (
    <PhotoSeries
      showAdmin={isAdmin}
      title="Serie"
      subtitle="Progetti coerenti: un filo narrativo, un luogo, un'idea."
    />
  );
}
