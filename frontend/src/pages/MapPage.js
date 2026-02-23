import React from 'react';
import WorldMap from '../components/WorldMap';
import useSeo from '../seo/useSeo';

export default function MapPage() {
  useSeo({
    title: 'Mappa Fotografica',
    description: 'Mappa fotografica interattiva di Kevin Muka per esplorare gli scatti in base alla posizione geografica.',
  });

  return <WorldMap />;
}
