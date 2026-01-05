import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Plus } from 'lucide-react';

import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import SeriesEditor from './SeriesEditor';
import { IMAGES_BASE_URL } from '../utils/constants';

const SectionRoot = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--spacing-xl);
  row-gap: var(--spacing-2xl);
  align-items: start;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
    grid-template-columns: 1fr;
  }
`;

const Heading = styled.div`
  max-width: 740px;
  grid-column: 1;
`;

const Title = styled.h2`
  margin: 0 0 8px;
  font-size: clamp(1.9rem, 3.5vw, 2.6rem);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -0.03em;
  color: var(--color-text);
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--color-muted);
  line-height: 1.7;
`;

const CreateButton = styled(motion.button)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--border-radius-full);
  border: 1px solid rgba(214, 179, 106, 0.45);
  background: rgba(214, 179, 106, 0.12);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);

  &:hover {
    background: rgba(214, 179, 106, 0.18);
    box-shadow: var(--shadow-small);
    transform: translateY(-1px);
  }
`;

const StickyCreate = styled.div`
  position: sticky;
  top: calc(78px + 12px);
  z-index: var(--z-sticky);
  display: flex;
  justify-content: flex-end;
  align-self: flex-start;
  margin-top: 4px;
  grid-column: 2;
  justify-self: end;

  @media (max-width: 768px) {
    top: calc(70px + 12px);
    grid-column: 1;
    justify-self: start;
  }
`;

const Grid = styled(motion.div)`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-xl);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled(motion.div)`
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  cursor: pointer;
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

const CoverImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.01);
  transition: transform var(--transition-normal);

  ${Card}:hover & {
    transform: scale(1.06);
  }
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

const Info = styled.div`
  padding: 14px 16px 16px;
`;

const CardTitle = styled.h3`
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: var(--color-text);
  letter-spacing: -0.01em;
`;

const CardDesc = styled.p`
  margin: 0 0 12px;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Tag = styled.span`
  padding: 6px 10px;
  border-radius: var(--border-radius-full);
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-muted);
`;

const Empty = styled.div`
  grid-column: 1 / -1;
  text-align: center;
  padding: var(--spacing-4xl) 0;
  color: var(--color-muted);
`;

export default function PhotoSeries({ showAdmin = false, title = 'Serie', subtitle = "Progetti coerenti: un filo narrativo, un luogo, un'idea." }) {
  const navigate = useNavigate();
  const { series, loading } = useSeries();
  const { photos } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);

  const publishedSeries = useMemo(() => series.filter(s => s.published), [series]);

  const getSeriesPhotos = (seriesItem) => {
    const ids = seriesItem.photos || [];
    return photos.filter(photo => ids.includes(photo.id));
  };

  const getCoverPhoto = (seriesItem) => {
    if (seriesItem.coverImage) {
      const cover = photos.find(p => p.id === seriesItem.coverImage);
      if (cover) return cover;
    }
    const list = getSeriesPhotos(seriesItem);
    return list[0] || null;
  };

  const getTopLocations = (seriesItem) => {
    const list = getSeriesPhotos(seriesItem);
    const locs = list
      .map(p => p.location)
      .filter(Boolean)
      .map(l => String(l).trim())
      .filter(l => l.length > 0);
    return [...new Set(locs)].slice(0, 3);
  };

  const handleSeriesClick = (seriesItem) => {
    navigate(`/series/${seriesItem.slug || seriesItem.id}`);
  };

  return (
    <>
      <SectionRoot
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <Container>
          <Heading>
            <Title>{title}</Title>
            <Subtitle>{subtitle}</Subtitle>
          </Heading>
          {showAdmin && (
            <StickyCreate>
              <CreateButton
                onClick={() => setShowEditor(true)}
                whileTap={{ scale: 0.98 }}
              >
                <Plus size={16} />
                Nuova serie
              </CreateButton>
            </StickyCreate>
          )}

          {!loading && publishedSeries.length > 0 ? (
            <Grid key={publishedSeries.map(s => s.id).join('-')}>
              {publishedSeries.map((s, idx) => {
                const cover = getCoverPhoto(s);
                const seriesPhotos = getSeriesPhotos(s);
                const count = seriesPhotos.length;
                const locs = getTopLocations(s);

                return (
                  <Card
                    key={s.id}
                    onClick={() => handleSeriesClick(s)}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-120px' }}
                    transition={{ duration: 0.35, ease: 'easeOut', delay: Math.min(0.24, idx * 0.04) }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <Cover>
                      {cover && (
                        <CoverImage
                          src={`${IMAGES_BASE_URL}${cover.url}?t=${cover.id}`}
                          alt={s.title}
                          loading="lazy"
                        />
                      )}
                      <Count><Camera size={14} /> {count}</Count>
                    </Cover>

                    <Info>
                      <CardTitle>{s.title}</CardTitle>
                      <CardDesc>{s.description || 'Serie fotografica'}</CardDesc>
                      {locs.length > 0 && (
                        <Tags>
                          {locs.map((l) => <Tag key={l}>{l}</Tag>)}
                        </Tags>
                      )}
                    </Info>
                  </Card>
                );
              })}
            </Grid>
          ) : (
            <Empty>
              <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-text)' }}>
                Nessuna serie disponibile
              </p>
              {showAdmin ? (
                <p style={{ margin: '10px 0 0', color: 'var(--color-muted)' }}>
                  Crea la tua prima serie con “Nuova serie”.
                </p>
              ) : null}
            </Empty>
          )}
        </Container>
      </SectionRoot>

      <AnimatePresence>
        {showEditor && <SeriesEditor onClose={() => setShowEditor(false)} />}
      </AnimatePresence>
    </>
  );
}
