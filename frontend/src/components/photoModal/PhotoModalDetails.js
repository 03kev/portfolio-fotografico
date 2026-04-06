import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Download, Map, MapPin } from 'lucide-react';

const PhotoTitle = styled(motion.h2)`
  color: var(--color-white);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: var(--font-size-xl);
    margin-bottom: 10px;
  }
`;

const PhotoLocation = styled(motion.p)`
  color: var(--color-accent);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover {
    color: var(--color-white);
  }

  @media (max-width: 768px) {
    font-size: var(--font-size-base);
    margin-bottom: 12px;
  }
`;

const PhotoDescription = styled(motion.p)`
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--font-size-base);
  line-height: 1.6;
  margin-bottom: var(--spacing-xl);

  @media (max-width: 768px) {
    font-size: var(--font-size-sm);
    line-height: 1.55;
    margin-bottom: 14px;
  }
`;

const MetadataSection = styled(motion.div)`
  margin-bottom: var(--spacing-xl);

  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
`;

const MetadataTitle = styled.h3`
  color: var(--color-white);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  @media (max-width: 768px) {
    font-size: var(--font-size-base);
    margin-bottom: 10px;
    padding-bottom: 8px;
  }
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

const MetadataItem = styled.div`
  background: rgba(255, 255, 255, 0.02);
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);

  &.wide {
    grid-column: 1 / -1;
  }

  .label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.78rem;
    font-weight: var(--font-weight-medium);
    margin-bottom: 6px;
  }

  .value {
    color: var(--color-white);
    font-size: 0.98rem;
    font-weight: var(--font-weight-medium);
    line-height: 1.35;
  }
`;

const TagsContainer = styled(motion.div)`
  margin-bottom: var(--spacing-xl);
`;

const TagsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);

  @media (max-width: 768px) {
    gap: 8px;
  }
`;

const Tag = styled(motion.span)`
  background: var(--accent-gradient);
  color: var(--color-white);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(79, 172, 254, 0.3);
  }
`;

const ActionButtons = styled(motion.div)`
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);

  @media (max-width: 768px) {
    flex-direction: row;
    gap: 10px;
    margin-top: 16px;
  }
`;

const ActionButton = styled(motion.button)`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--spacing-md) var(--spacing-lg);
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-white);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--border-radius);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    background: var(--accent-gradient);
    border-color: transparent;
    transform: translateY(-2px);
  }

  &.primary {
    background: var(--primary-gradient);
    border-color: transparent;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(103, 126, 234, 0.4);
    }
  }

  @media (max-width: 768px) {
    min-width: 0;
    padding: 14px 12px;
    font-size: 0.95rem;
    gap: 6px;
  }

  @media (max-width: 420px) {
    font-size: 0.88rem;
    padding: 13px 10px;

    svg {
      width: 15px;
      height: 15px;
    }
  }
`;

const getAnimationProps = (withMotion, delay) => {
  if (!withMotion) {
    return {
      initial: false,
      animate: false,
      transition: undefined
    };
  }

  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay }
  };
};

const getTagAnimationProps = (withMotion, delay) => {
  if (!withMotion) {
    return {
      initial: false,
      animate: false,
      transition: undefined
    };
  }

  return {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, delay }
  };
};

const PhotoModalDetails = ({
  photo,
  canDownload,
  downloadSrc,
  galleryModalOpen,
  actions,
  handleLocationClick,
  handleTagClick,
  formatDate,
  formatResolution,
  withMotion = true
}) => {
  const hasTechnicalData = Boolean(
    photo.camera ||
      photo.lens ||
      photo.resolution ||
      photo.settings?.aperture ||
      photo.settings?.shutter ||
      photo.settings?.iso ||
      photo.settings?.focal ||
      photo.date
  );

  return (
    <>
      <PhotoTitle {...getAnimationProps(withMotion, 0.1)}>{photo.title}</PhotoTitle>

      <PhotoLocation {...getAnimationProps(withMotion, 0.2)} onClick={handleLocationClick}>
        <MapPin size={16} />
        {photo.location}
      </PhotoLocation>

      {photo.description && (
        <PhotoDescription {...getAnimationProps(withMotion, 0.3)}>
          {photo.description}
        </PhotoDescription>
      )}

      {hasTechnicalData && (
        <MetadataSection {...getAnimationProps(withMotion, 0.4)}>
          <MetadataTitle>Dati Tecnici</MetadataTitle>
          <MetadataGrid>
            {photo.camera && (
              <MetadataItem className="wide">
                <div className="label">Camera</div>
                <div className="value">{photo.camera}</div>
              </MetadataItem>
            )}
            {photo.lens && (
              <MetadataItem className="wide">
                <div className="label">Obiettivo</div>
                <div className="value">{photo.lens}</div>
              </MetadataItem>
            )}
            {photo.resolution && (
              <MetadataItem className="wide">
                <div className="label">Risoluzione</div>
                <div className="value">{formatResolution(photo.resolution)}</div>
              </MetadataItem>
            )}
            {photo.settings?.aperture && (
              <MetadataItem>
                <div className="label">Apertura</div>
                <div className="value">{photo.settings.aperture}</div>
              </MetadataItem>
            )}
            {photo.settings?.shutter && (
              <MetadataItem>
                <div className="label">Tempo</div>
                <div className="value">{photo.settings.shutter}</div>
              </MetadataItem>
            )}
            {photo.settings?.iso && (
              <MetadataItem>
                <div className="label">ISO</div>
                <div className="value">{photo.settings.iso}</div>
              </MetadataItem>
            )}
            {photo.settings?.focal && (
              <MetadataItem>
                <div className="label">Focale</div>
                <div className="value">{photo.settings.focal}</div>
              </MetadataItem>
            )}
            {photo.date && (
              <MetadataItem className="wide">
                <div className="label">Data</div>
                <div className="value">{formatDate(photo.date)}</div>
              </MetadataItem>
            )}
          </MetadataGrid>
        </MetadataSection>
      )}

      {photo.tags && photo.tags.length > 0 && (
        <TagsContainer {...getAnimationProps(withMotion, 0.5)}>
          <MetadataTitle>Tag</MetadataTitle>
          <TagsGrid>
            {photo.tags.map((tag, index) => (
              <Tag
                key={tag}
                onClick={() => handleTagClick(tag)}
                {...getTagAnimationProps(withMotion, 0.1 * index)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {tag}
              </Tag>
            ))}
          </TagsGrid>
        </TagsContainer>
      )}

      <ActionButtons {...getAnimationProps(withMotion, 0.6)}>
        <ActionButton onClick={handleLocationClick} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Map size={16} />
          Vai alla Mappa
        </ActionButton>
        <ActionButton
          className="primary"
          disabled={!canDownload}
          onClick={() => {
            if (!canDownload) return;
            if (galleryModalOpen) actions.closeGalleryModal();
            const link = document.createElement('a');
            link.href = downloadSrc;
            link.download = `${photo.title}.jpg`;
            link.click();
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Download size={16} />
          Download
        </ActionButton>
      </ActionButtons>
    </>
  );
};

export default PhotoModalDetails;
