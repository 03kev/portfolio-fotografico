import React, { useEffect } from 'react';
import WorldMap from '../components/WorldMap';

export default function MapPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return <WorldMap />;
}
