import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

const Grid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(6, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
`;

const Tile = styled(motion.button)`
  border: 0;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  aspect-ratio: 1 / 1;

  &:focus-visible {
    outline: 2px solid rgba(214, 179, 106, 0.6);
    outline-offset: 3px;
  }
`;

const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.01);
  transition: transform var(--transition-normal), filter var(--transition-normal);

  ${Tile}:hover & {
    transform: scale(1.06);
    filter: contrast(1.02) saturate(1.02);
  }
`;

const CTA = styled.div`
  margin-top: var(--spacing-xl);
  display: flex;
  justify-content: center;
`;

const Button = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: var(--border-radius-full);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);

  &:hover {
    border-color: rgba(214, 179, 106, 0.35);
    background: rgba(214, 179, 106, 0.08);
    transform: translateY(-1px);
  }
`;

export default function FeaturedGallery({ limit = 18 }) {
  const { photos, actions } = usePhotos();

  const items = React.useMemo(() => {
    // Most recent first: if there is a createdAt field use it, otherwise keep the current order
    const sorted = [...photos];
    if (sorted.length && sorted[0] && (sorted[0].createdAt || sorted[0].created_at)) {
      sorted.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));
    }
    return sorted.slice(0, limit);
  }, [photos, limit]);

  const variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { staggerChildren: 0.035 } }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.98 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } }
  };

  return (
    <>
      <Grid 
        key={items.map(p => p.id).join('-')}
        variants={variants} 
        initial="hidden" 
        whileInView="show" 
        viewport={{ once: true, margin: '-120px' }}
      >
        {items.map((p) => (
          <Tile
            key={p.id}
            variants={item}
            onClick={() => actions.openPhotoModal(p)}
            aria-label={p.title || 'Apri foto'}
          >
            <Img 
              src={`${IMAGES_BASE_URL}${p.url}?t=${p.id}`} 
              alt={p.title || 'Foto'} 
              loading="lazy" 
            />
          </Tile>
        ))}
      </Grid>

      {photos.length > limit && (
        <CTA>
          <Button to="/gallery">Vedi tutta la galleria</Button>
        </CTA>
      )}
    </>
  );
}
