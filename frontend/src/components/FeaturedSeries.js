import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

const Grid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-xl);
`;

const Card = styled(motion(Link))`
  display: block;
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: transform var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal);

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(214, 179, 106, 0.35);
    box-shadow: var(--shadow-medium);
  }
`;

const Cover = styled.div`
  position: relative;
  aspect-ratio: 16 / 10;
  background: rgba(255, 255, 255, 0.03);
`;

const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const Meta = styled.div`
  padding: 14px 16px 16px;
`;

const Name = styled.h3`
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: var(--color-text);
  letter-spacing: -0.01em;
`;

const Desc = styled.p`
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Count = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--border-radius-full);
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  backdrop-filter: blur(10px);
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

export default function FeaturedSeries({ limit = 6 }) {
  const { series } = useSeries();
  const { photos } = usePhotos();

  const published = React.useMemo(() => series.filter(s => s.published), [series]);
  const top = published.slice(0, limit);

  const getCover = (s) => {
    const coverId = s.coverImage || s.photos?.[0];
    const photo = photos.find(p => p.id === coverId);
    if (!photo) return null;
    return `${IMAGES_BASE_URL}${photo.image}`;
  };

  const variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
  };

  return (
    <>
      <Grid variants={variants} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }}>
        {top.map((s) => {
          const cover = getCover(s);
          const count = s.photos?.length || 0;
          return (
            <Card key={s.id} to={`/series/${s.slug}`} variants={item}>
              <Cover>
                {cover ? <Img src={cover} alt={s.title} loading="lazy" /> : null}
                <Count><Camera size={14} /> {count}</Count>
              </Cover>
              <Meta>
                <Name>{s.title}</Name>
                <Desc>{s.description || 'Serie fotografica'}</Desc>
              </Meta>
            </Card>
          );
        })}
      </Grid>

      {published.length > limit && (
        <CTA>
          <Button to="/series">Vedi tutte le serie</Button>
        </CTA>
      )}
    </>
  );
}
