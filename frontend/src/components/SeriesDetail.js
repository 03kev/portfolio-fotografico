import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import SeriesEditor from './SeriesEditor';
import { IMAGES_BASE_URL } from '../utils/constants';
import useAdminMode from '../hooks/useAdminMode';

const PageContainer = styled.div`
  min-height: 100vh;
  background: transparent;
  padding-top: 80px;
`;

const HeroSection = styled(motion.div)`
  position: relative;
  height: 60vh;
  min-height: 400px;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.72) 70%, rgba(0,0,0,0.95) 100%);
    z-index: 1;
  }
`;

const CoverImage = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url(${props => props.src});
  background-size: cover;
  background-position: center;
`;

const HeroContent = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--spacing-4xl) var(--spacing-xl);
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
`;

const BackButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-2xl);
  left: var(--spacing-xl);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  z-index: 3;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
    border-color: rgba(255, 255, 255, 0.3);
  }
`;

const EditButton = styled(BackButton)`
  left: auto;
  right: var(--spacing-xl);
  background: var(--primary-gradient);
  border-color: transparent;

  &:hover {
    opacity: 0.9;
  }
`;

const SeriesTitle = styled(motion.h1)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-black);
  color: var(--color-white);
  margin-bottom: var(--spacing-md);
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
`;

const SeriesDescription = styled(motion.p)`
  font-size: var(--font-size-xl);
  color: rgba(255, 255, 255, 0.9);
  max-width: 800px;
  line-height: 1.6;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
`;

const PhotoCount = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-base);
  color: var(--color-white);
  margin-top: var(--spacing-lg);
`;

const ContentSection = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-4xl) var(--spacing-xl);
`;

const ContentBlock = styled(motion.div)`
  margin-bottom: var(--spacing-4xl);
`;

const TextBlock = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-left: 4px solid var(--color-primary);
  padding: var(--spacing-2xl);
  border-radius: var(--border-radius-lg);
  margin: var(--spacing-2xl) 0;

  p {
    font-size: var(--font-size-lg);
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.8;
    white-space: pre-wrap;
  }
`;

const PhotoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-xl);
  margin: var(--spacing-2xl) 0;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }
`;

const PhotoCard = styled(motion.div)`
  position: relative;
  aspect-ratio: 4/3;
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);

  &:hover {
    border-color: rgba(102, 126, 234, 0.5);
  }
`;

const PhotoImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);

  ${PhotoCard}:hover & {
    transform: scale(1.1);
  }
`;

const PhotoOverlay = styled(motion.div)`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, transparent 100%);
  padding: var(--spacing-lg);
  transform: translateY(100%);
  transition: transform var(--transition-normal);

  ${PhotoCard}:hover & {
    transform: translateY(0);
  }
`;

const PhotoTitle = styled.h4`
  color: var(--color-white);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-xs);
`;

const PhotoLocation = styled.p`
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--font-size-sm);
`;

const LoadingContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0c0c0c;
`;

const LoadingSpinner = styled(motion.div)`
  width: 60px;
  height: 60px;
  border: 4px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
`;

const ErrorContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0c0c0c;
  padding: var(--spacing-xl);
  text-align: center;
`;

const ErrorIcon = styled.div`
  font-size: 4rem;
  margin-bottom: var(--spacing-lg);
`;

const ErrorText = styled.h2`
  color: var(--color-white);
  font-size: var(--font-size-2xl);
  margin-bottom: var(--spacing-md);
`;

const ErrorButton = styled(motion.button)`
  background: var(--primary-gradient);
  border: none;
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  margin-top: var(--spacing-lg);

  &:hover {
    opacity: 0.9;
  }
`;

function SeriesDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { currentSeries, fetchSeriesBySlug, loading, error } = useSeries();
  const { photos, actions } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const isAdmin = useAdminMode();

  useEffect(() => {
    if (slug) {
      fetchSeriesBySlug(slug);
    }
  }, [slug, fetchSeriesBySlug]);

  useEffect(() => {
    if (currentSeries && photos.length > 0) {
      const filteredPhotos = photos.filter(photo => 
        currentSeries.photos.includes(photo.id)
      );
      setSeriesPhotos(filteredPhotos);
    }
  }, [currentSeries, photos]);

  // Scroll alla HeroSection quando la serie viene caricata
  useEffect(() => {
    if (currentSeries) {
      // Piccolo delay per assicurarsi che il contenuto sia renderizzato
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 0);
    }
  }, [currentSeries]);

  const handlePhotoClick = (photo) => {
    actions.openPhotoModal(photo);
  };

  const getCoverPhoto = () => {
    if (!currentSeries) return null;
    if (currentSeries.coverImage) {
      const coverPhoto = photos.find(p => p.id === currentSeries.coverImage);
      if (coverPhoto) return coverPhoto;
    }
    return seriesPhotos[0] || null;
  };

  if (loading) {
    return (
      <LoadingContainer>
        <LoadingSpinner
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </LoadingContainer>
    );
  }

  if (error || !currentSeries) {
    return (
      <ErrorContainer>
        <ErrorIcon>😕</ErrorIcon>
        <ErrorText>Serie non trovata</ErrorText>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
          La serie che stai cercando non esiste o non è più disponibile.
        </p>
        <ErrorButton
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Torna alla Home
        </ErrorButton>
      </ErrorContainer>
    );
  }

  const coverPhoto = getCoverPhoto();

  return (
    <>
      <PageContainer>
        <HeroSection>
          {coverPhoto && (
            <CoverImage
              src={`${IMAGES_BASE_URL}${coverPhoto.image}`}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5 }}
            />
          )}
          
          <BackButton
            onClick={() => navigate('/')}
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
          >
            <span>←</span> Indietro
          </BackButton>

          {isAdmin && (
            <EditButton
              onClick={() => setShowEditor(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span>✏️</span> Modifica
            </EditButton>
          )}

          <HeroContent>
            <SeriesTitle
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {currentSeries.title}
            </SeriesTitle>
            <SeriesDescription
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              {currentSeries.description}
            </SeriesDescription>
            <PhotoCount
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              Foto: {seriesPhotos.length}
            </PhotoCount>
          </HeroContent>
        </HeroSection>

        <ContentSection>
          {currentSeries.content && currentSeries.content.length > 0 ? (
            currentSeries.content.map((block, index) => (
              <ContentBlock
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                {block.type === 'text' ? (
                  <TextBlock>
                    <p>{block.content}</p>
                  </TextBlock>
                ) : block.type === 'photos' ? (
                  <PhotoGrid>
                    {block.content.map(photoId => {
                      const photo = photos.find(p => p.id === photoId);
                      return photo ? (
                        <PhotoCard
                          key={photo.id}
                          onClick={() => handlePhotoClick(photo)}
                          whileHover={{ y: -8 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <PhotoImage
                            src={`${IMAGES_BASE_URL}${photo.image}`}
                            alt={photo.title}
                            loading="lazy"
                          />
                          <PhotoOverlay>
                            <PhotoTitle>{photo.title}</PhotoTitle>
                            <PhotoLocation>{photo.location}</PhotoLocation>
                          </PhotoOverlay>
                        </PhotoCard>
                      ) : null;
                    })}
                  </PhotoGrid>
                ) : null}
              </ContentBlock>
            ))
          ) : (
            <PhotoGrid>
              {seriesPhotos.map((photo, index) => (
                <PhotoCard
                  key={photo.id}
                  onClick={() => handlePhotoClick(photo)}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ y: -8 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <PhotoImage
                    src={`${IMAGES_BASE_URL}${photo.image}`}
                    alt={photo.title}
                    loading="lazy"
                  />
                  <PhotoOverlay>
                    <PhotoTitle>{photo.title}</PhotoTitle>
                    <PhotoLocation>{photo.location}</PhotoLocation>
                  </PhotoOverlay>
                </PhotoCard>
              ))}
            </PhotoGrid>
          )}
        </ContentSection>
      </PageContainer>

      <AnimatePresence>
        {showEditor && (
          <SeriesEditor
            series={currentSeries}
            onClose={() => setShowEditor(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default SeriesDetail;
