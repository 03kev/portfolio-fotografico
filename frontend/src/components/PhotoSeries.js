import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import SeriesEditor from './SeriesEditor';
import { IMAGES_BASE_URL } from '../utils/constants';

const SeriesSection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 50%, #0c0c0c 100%);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.1) 0%, transparent 50%),
                radial-gradient(circle at 80% 50%, rgba(245, 87, 108, 0.1) 0%, transparent 50%);
    pointer-events: none;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  position: relative;
  z-index: 1;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const SectionHeader = styled.div`
  text-align: center;
  margin-bottom: var(--spacing-4xl);
  position: relative;
`;

const SectionTitle = styled(motion.h2)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-black);
  margin-bottom: var(--spacing-lg);
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const SectionDescription = styled(motion.p)`
  font-size: var(--font-size-lg);
  color: rgba(255, 255, 255, 0.7);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
`;

const CreateButton = styled(motion.button)`
  position: absolute;
  top: 0;
  right: 0;
  background: var(--primary-gradient);
  border: none;
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);

  &:hover {
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    position: static;
    margin: var(--spacing-lg) auto 0;
  }
`;

const SeriesGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-2xl);
  margin-bottom: var(--spacing-3xl);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-xl);
  }
`;

const SeriesCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    transform: translateY(-8px);
    border-color: rgba(102, 126, 234, 0.5);
    box-shadow: 0 20px 40px rgba(102, 126, 234, 0.2);
  }
`;

const SeriesCover = styled.div`
  position: relative;
  height: 250px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
`;

const CoverImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);

  ${SeriesCard}:hover & {
    transform: scale(1.1);
  }
`;

const PhotoCount = styled.div`
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  color: var(--color-white);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);

  &::before {
    content: '📸';
  }
`;

const SeriesInfo = styled.div`
  padding: var(--spacing-xl);
`;

const SeriesTitle = styled.h3`
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-white);
  margin-bottom: var(--spacing-sm);
`;

const SeriesDescription = styled.p`
  font-size: var(--font-size-base);
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  margin-bottom: var(--spacing-md);
`;

const SeriesMeta = styled.div`
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
`;

const MetaTag = styled.span`
  background: rgba(102, 126, 234, 0.2);
  color: rgba(102, 126, 234, 1);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: 1px solid rgba(102, 126, 234, 0.3);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: var(--spacing-4xl);
  color: rgba(255, 255, 255, 0.5);
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: var(--spacing-lg);
`;

const EmptyText = styled.p`
  font-size: var(--font-size-lg);
  margin-bottom: var(--spacing-md);
`;

// Componente principale
function PhotoSeries() {
  const navigate = useNavigate();
  const { series, loading } = useSeries();
  const { photos } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);

  // Filtra solo le serie pubblicate
  const publishedSeries = React.useMemo(() => {
    return series.filter(s => s.published);
  }, [series]);

  // Ottieni le foto per ogni serie
  const getSeriesPhotos = (seriesItem) => {
    return photos.filter(photo => seriesItem.photos.includes(photo.id));
  };

  const getCoverPhoto = (seriesItem) => {
    if (seriesItem.coverImage) {
      const coverPhoto = photos.find(p => p.id === seriesItem.coverImage);
      if (coverPhoto) return coverPhoto;
    }
    const seriesPhotos = getSeriesPhotos(seriesItem);
    return seriesPhotos[0] || null;
  };

  const handleSeriesClick = (seriesItem) => {
    navigate(`/series/${seriesItem.slug || seriesItem.id}`);
  };

  return (
    <>
      <SeriesSection
        id="series"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <Container>
          <SectionHeader>
            <SectionTitle
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              Serie Fotografiche
            </SectionTitle>
            <SectionDescription
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Esplora le mie collezioni tematiche e scopri le storie dietro ogni scatto
            </SectionDescription>
            <CreateButton
              onClick={() => setShowEditor(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <span>+</span> Nuova Serie
            </CreateButton>
          </SectionHeader>

          {!loading && publishedSeries.length > 0 ? (
            <SeriesGrid>
              {publishedSeries.map((seriesItem, index) => {
                const coverPhoto = getCoverPhoto(seriesItem);
                const seriesPhotos = getSeriesPhotos(seriesItem);
                
                return (
                  <SeriesCard
                    key={seriesItem.id}
                    onClick={() => handleSeriesClick(seriesItem)}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <SeriesCover>
                      {coverPhoto && (
                        <CoverImage
                          src={`${IMAGES_BASE_URL}${coverPhoto.thumbnail || coverPhoto.image}`}
                          alt={seriesItem.title}
                          loading="lazy"
                        />
                      )}
                      <PhotoCount>{seriesPhotos.length}</PhotoCount>
                    </SeriesCover>
                    <SeriesInfo>
                      <SeriesTitle>{seriesItem.title}</SeriesTitle>
                      <SeriesDescription>{seriesItem.description}</SeriesDescription>
                      <SeriesMeta>
                        {seriesPhotos.slice(0, 3).map((photo, idx) => (
                          <MetaTag key={idx}>{photo.location}</MetaTag>
                        ))}
                        {seriesPhotos.length > 3 && (
                          <MetaTag>+{seriesPhotos.length - 3} altre</MetaTag>
                        )}
                      </SeriesMeta>
                    </SeriesInfo>
                  </SeriesCard>
                );
              })}
            </SeriesGrid>
          ) : (
            <EmptyState>
              <EmptyIcon>📷</EmptyIcon>
              <EmptyText>Nessuna serie fotografica disponibile</EmptyText>
              <p>Crea la tua prima serie fotografica cliccando sul pulsante "Nuova Serie"</p>
            </EmptyState>
          )}
        </Container>
      </SeriesSection>

      {/* Editor per nuova serie */}
      <AnimatePresence>
        {showEditor && (
          <SeriesEditor onClose={() => setShowEditor(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

export default PhotoSeries;
