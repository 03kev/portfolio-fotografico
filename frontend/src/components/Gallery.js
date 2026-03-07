import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Edit3, Crop, Upload, Loader2 } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolveAssetUrl } from '../utils/imageUrl';
import { photoService } from '../utils/api';
import PhotoUpload from './PhotoUpload';
import PhotoCropModal from './PhotoCropModal';

const DEBOUNCE_DELAY_FILTER = 200;
const SOURCE_REUPLOAD_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.98, y: -8, transition: { duration: 0.25 } }
};

const GallerySection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: transparent;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--spacing-2xl);
`;

const SectionTitle = styled(motion.h2)`
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -0.03em;
  color: var(--color-text);
  margin: 0;
`;

const SectionSubtitle = styled(motion.p)`
  max-width: 680px;
  text-align: center;
  margin: 0;
  color: var(--color-muted);
`;

const ControlsRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
`;

const SearchContainer = styled(motion.div)`
  max-width: 560px;
  margin: 0 auto;
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 44px 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: var(--border-radius-xl);
  color: var(--color-text);
  font-size: var(--font-size-base);

  &:focus {
    border-color: rgba(214, 179, 106, 0.55);
    box-shadow: 0 0 0 3px rgba(214, 179, 106, 0.10);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
`;

const FilterContainer = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
`;

const FilterButton = styled(motion.button)`
  background: ${props => props.active ? 'rgba(214, 179, 106, 0.14)' : 'rgba(255, 255, 255, 0.03)'};
  color: ${props => props.active ? 'var(--color-text)' : 'var(--color-muted)'};
  border: 1px solid ${props => props.active ? 'rgba(214, 179, 106, 0.45)' : 'rgba(255, 255, 255, 0.10)'};
  padding: 8px 12px;
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);

  &:hover {
    color: var(--color-text);
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-1px);
  }
`;

const GalleryGrid = styled(motion.div).attrs({ layout: true })`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-xl);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }
`;

const PhotoCard = styled(motion.div)`
  position: relative;
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  aspect-ratio: 4/3;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--shadow-medium);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(214, 179, 106, 0.22);
    box-shadow: var(--shadow-large);
  }
`;

const SeoImageLink = styled.a`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const PhotoImage = styled(motion.img)`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s ease;

  ${PhotoCard}:hover & {
    transform: scale(1.03);
  }
`;

const PhotoOverlay = styled(motion.div)`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.15) 55%, rgba(0, 0, 0, 0.0));
  padding: var(--spacing-lg);
  opacity: 0;
  transition: opacity var(--transition-normal);

  ${PhotoCard}:hover & {
    opacity: 1;
  }
`;

const DeleteButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  background: rgba(220, 38, 38, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(185, 28, 28, 1);
  }
`;

const EditButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 48px);
  background: rgba(214, 179, 106, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(184, 149, 76, 1);
  }
`;

const CropButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 96px);
  background: rgba(39, 137, 255, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(18, 118, 236, 1);
  }
`;

const ReplaceSourceButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 144px);
  background: rgba(123, 107, 255, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(103, 84, 255, 1);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.5;
  }
`;

const ReuploadCardOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(8, 10, 16, 0.58);
  backdrop-filter: blur(2px);
  z-index: 12;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.94);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.01em;
`;

const ReuploadCardSpinner = styled(Loader2)`
  animation: replace-source-spin 0.9s linear infinite;
  color: rgba(214, 179, 106, 0.98);
  filter: drop-shadow(0 0 8px rgba(214, 179, 106, 0.35));

  @keyframes replace-source-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const OverlayContent = styled.div`
  width: 100%;
`;

const PhotoTitle = styled.h3`
  color: var(--color-text);
  margin: 0 0 6px 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
`;

const PhotoLocation = styled.p`
  color: rgba(255, 255, 255, 0.78);
  margin: 0 0 6px 0;
  font-size: var(--font-size-sm);
`;

const PhotoDescription = styled.p`
  color: rgba(255, 255, 255, 0.70);
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
`;

const PhotoTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const Tag = styled.span`
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.80);
  padding: 4px 8px;
  border-radius: var(--border-radius-full);
  font-size: 0.72rem;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 320px;
`;

const LoadingSpinner = styled.div`
  width: 42px;
  height: 42px;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  border-top-color: rgba(214, 179, 106, 0.85);
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const NoResults = styled(motion.div)`
  text-align: center;
  padding: var(--spacing-3xl) var(--spacing-lg);
  color: var(--color-muted);

  h3 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-sm);
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: var(--font-size-base);
  }
`;

const Gallery = ({ headingLevel = 'h2', forcedPhotoId = null, hideCardDescriptions = false }) => {
  const { photos, filteredPhotos, loading, actions, filters, modalOpen } = usePhotos();
  const outletContext = useOutletContext();
  const isAdmin = Boolean(outletContext?.isAdmin);
  const notify = outletContext?.notify || null;
  const [searchParams] = useSearchParams();
  const photoParam = searchParams.get('photo');
  const resolvedPhotoId = forcedPhotoId || photoParam;
  const autoOpenedPhotoRef = useRef(null);
  const sourceFileInputRef = useRef(null);

  const [activeFilter, setActiveFilter] = useState(() => {
    return filters.tags && filters.tags.length > 0 ? filters.tags[0] : 'all';
  });
  const [searchTerm, setSearchTerm] = useState(() => {
    return filters.search || '';
  });
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [croppingPhoto, setCroppingPhoto] = useState(null);
  const [reuploadSourcePhoto, setReuploadSourcePhoto] = useState(null);
  const [reuploadingSourceId, setReuploadingSourceId] = useState(null);

  const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY_FILTER);

  const allTags = useMemo(() =>
    [...new Set(photos.flatMap(photo => Array.isArray(photo.tags) ? photo.tags : []))],
  [photos]);

  const filterOptions = useMemo(() => ['all', ...allTags], [allTags]);

  useEffect(() => {
    if (debouncedSearchTerm.trim()) {
      if (activeFilter !== 'all') {
        actions.setFilter({ search: debouncedSearchTerm, tags: [activeFilter] });
      } else {
        actions.setFilter({ search: debouncedSearchTerm, tags: [] });
      }
    } else {
      if (activeFilter !== 'all') {
        actions.setFilter({ search: '', tags: [activeFilter] });
      } else {
        actions.clearFilters();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, activeFilter]);

  useEffect(() => {
    const currentTag = filters.tags && filters.tags.length > 0 ? filters.tags[0] : 'all';
    const currentSearch = filters.search || '';

    if (currentTag !== activeFilter) setActiveFilter(currentTag);
    if (currentSearch !== searchTerm) setSearchTerm(currentSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.tags?.join(','), filters.search]);

  useEffect(() => {
    if (!resolvedPhotoId) {
      autoOpenedPhotoRef.current = null;
      return;
    }

    if (loading || photos.length === 0) return;
    if (autoOpenedPhotoRef.current === resolvedPhotoId) return;

    const targetPhoto = photos.find((photo) => String(photo.id) === String(resolvedPhotoId));
    if (!targetPhoto) return;

    actions.openPhotoModal(targetPhoto);
    autoOpenedPhotoRef.current = resolvedPhotoId;
  }, [resolvedPhotoId, loading, photos, actions]);

  const hasForcedPhotoId = Boolean(forcedPhotoId);
  const forcedPhotoExists = !hasForcedPhotoId
    || photos.some((photo) => String(photo.id) === String(forcedPhotoId));
  const waitingForForcedModal = hasForcedPhotoId && forcedPhotoExists && !modalOpen;

  const handleFilterClick = (filter) => {
    setActiveFilter(filter);
    if (filter === 'all') {
      actions.clearFilters();
      setSearchTerm('');
    }
  };

  const handlePhotoClick = (photo) => {
    actions.openPhotoModal(photo);
  };

  const getThumbImageUrl = (photo) => {
    const baseUrl = resolveAssetUrl(photo.thumbnail43);
    const version = photo?.derivativesVersion || photo?.updatedAt || photo?.id;
    if (!version) return baseUrl;
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}v=${encodeURIComponent(String(version))}`;
  };
  const getPhotoCardUrl = (photo) => `/photo/${encodeURIComponent(String(photo.id))}`;
  const getPhotoAltText = (photo) => {
    const title = String(photo?.title || 'Foto').trim() || 'Foto';
    const description = String(photo?.description || '').trim();
    const location = String(photo?.location || '').trim();

    if (description) return `${title} - ${description}`;
    if (location) return `${title} - ${location}`;
    return title;
  };

  const handleDelete = async (e, photoId) => {
    e.stopPropagation();
    if (window.confirm('Sei sicuro di voler eliminare questa foto?')) {
      try {
        await actions.deletePhoto(photoId);
      } catch (error) {
        console.error('Errore nell\'eliminazione della foto:', error);
        alert('Errore nell\'eliminazione della foto');
      }
    }
  };

  const handleEdit = (e, photo) => {
    e.stopPropagation();
    setEditingPhoto(photo);
  };

  const handleCrop = (e, photo) => {
    e.stopPropagation();
    setCroppingPhoto(photo);
  };

  const handleReuploadSourceClick = (e, photo) => {
    e.stopPropagation();
    if (reuploadingSourceId) return;
    setReuploadSourcePhoto(photo);
    if (sourceFileInputRef.current) {
      sourceFileInputRef.current.value = '';
      sourceFileInputRef.current.click();
    }
  };

  const handleReuploadSourceSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const targetPhoto = reuploadSourcePhoto;
    if (!file || !targetPhoto) {
      setReuploadSourcePhoto(null);
      return;
    }

    setReuploadingSourceId(targetPhoto.id);
    try {
      notify?.info?.(`Caricamento source in corso per "${targetPhoto.title || 'foto'}"...`, 2500);

      const signResponse = await photoService.getUploadUrl({
        uploadId: String(targetPhoto.id),
        variant: 'source',
        mimetype: file.type,
        fileSize: file.size
      });
      const signedData = signResponse?.data?.data || signResponse?.data;
      if (!signedData?.uploadUrl || !signedData?.sourcePath) {
        throw new Error('URL di upload source non valida ricevuta dal server.');
      }

      const uploadResponse = await fetch(signedData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Cache-Control': 'private, no-store'
        },
        body: file
      });
      if (!uploadResponse.ok) {
        throw new Error(`Upload source fallito (${uploadResponse.status}).`);
      }

      await photoService.replaceSource(targetPhoto.id, {
        sourcePath: signedData.sourcePath,
        sourceContentType: file.type
      });

      await actions.fetchPhotos();
      notify?.success?.(`Source aggiornata: "${targetPhoto.title || 'foto'}".`, 3500);
    } catch (error) {
      console.error('Errore reupload source privata:', error);
      notify?.error?.(
        error?.message || error?.error?.message || 'Errore durante il reupload della source privata.',
        5000
      );
    } finally {
      setReuploadSourcePhoto(null);
      setReuploadingSourceId(null);
    }
  };

  if (loading || waitingForForcedModal) {
    return (
      <GallerySection>
        <Container>
          <LoadingContainer>
            <LoadingSpinner />
          </LoadingContainer>
        </Container>
      </GallerySection>
    );
  }

  return (
    <GallerySection>
      <Container>
        <input
          ref={sourceFileInputRef}
          type="file"
          accept={SOURCE_REUPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleReuploadSourceSelected}
        />

        <SectionHeader>
          <SectionTitle as={headingLevel} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: 'easeOut' }}>
            Archivio
          </SectionTitle>
          <SectionSubtitle initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}>
            Filtra per tag o cerca per titolo, luogo e descrizione.
          </SectionSubtitle>
        </SectionHeader>

        <ControlsRow>
          <SearchContainer initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
            <SearchInput
              type="text"
              placeholder="Cerca…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <SearchIcon>
              <Search size={18} />
            </SearchIcon>
          </SearchContainer>

          <FilterContainer initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
            {filterOptions.map((filter) => (
              <FilterButton
                key={filter}
                active={activeFilter === filter}
                onClick={() => handleFilterClick(filter)}
                whileTap={{ scale: 0.98 }}
              >
                {filter === 'all' ? 'Tutti' : filter}
              </FilterButton>
            ))}
          </FilterContainer>
        </ControlsRow>

        {filteredPhotos.length === 0 ? (
          <NoResults initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3>Nessuna foto trovata</h3>
            <p>Prova a cambiare filtri o ricerca.</p>
          </NoResults>
        ) : (
          <GalleryGrid key="gallery-grid">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredPhotos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  layout
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={() => handlePhotoClick(photo)}
                >
                  <PhotoCard>
                    <SeoImageLink href={getPhotoCardUrl(photo)} aria-hidden="true" tabIndex={-1}>
                      {photo.title || 'Foto'}
                    </SeoImageLink>
                    {isAdmin && (
                      <>
                        <ReplaceSourceButton
                          onClick={(e) => handleReuploadSourceClick(e, photo)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          title="Reupload source privata"
                          disabled={reuploadingSourceId === photo.id}
                        >
                          <Upload size={18} />
                        </ReplaceSourceButton>
                        <CropButton
                          onClick={(e) => handleCrop(e, photo)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          title="Modifica crop"
                        >
                          <Crop size={18} />
                        </CropButton>
                        <EditButton
                          onClick={(e) => handleEdit(e, photo)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Edit3 size={18} />
                        </EditButton>
                        <DeleteButton
                          onClick={(e) => handleDelete(e, photo.id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Trash2 size={18} />
                        </DeleteButton>
                      </>
                    )}
                    <PhotoImage
                      src={getThumbImageUrl(photo)}
                      alt={getPhotoAltText(photo)}
                      loading={index < 3 ? 'eager' : 'lazy'}
                      fetchPriority={index < 3 ? 'high' : 'auto'}
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = LOCAL_IMAGE_FALLBACK;
                      }}
                    />
                    {reuploadingSourceId === photo.id && (
                      <ReuploadCardOverlay>
                        <ReuploadCardSpinner size={26} />
                        <span>Aggiornamento source...</span>
                      </ReuploadCardOverlay>
                    )}
                    <PhotoOverlay>
                      <OverlayContent>
                        <PhotoTitle>{photo.title}</PhotoTitle>
                        <PhotoLocation>{photo.location}</PhotoLocation>
                        {!hideCardDescriptions && (
                          <PhotoDescription>{photo.description}</PhotoDescription>
                        )}
                        {Array.isArray(photo.tags) && photo.tags.length > 0 && (
                          <PhotoTags>
                            {photo.tags.slice(0, 3).map(tag => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </PhotoTags>
                        )}
                      </OverlayContent>
                    </PhotoOverlay>
                  </PhotoCard>
                </motion.div>
              ))}
            </AnimatePresence>
          </GalleryGrid>
        )}

        {isAdmin && editingPhoto && (
          <PhotoUpload
            photoToEdit={editingPhoto}
            onClose={() => setEditingPhoto(null)}
            onUploadSuccess={() => {
              setEditingPhoto(null);
              actions.fetchPhotos();
            }}
          />
        )}

        <PhotoCropModal
          photo={croppingPhoto}
          isOpen={isAdmin && Boolean(croppingPhoto)}
          onClose={() => setCroppingPhoto(null)}
          onSaved={async () => {
            setCroppingPhoto(null);
            await actions.fetchPhotos();
          }}
        />
      </Container>
    </GallerySection>
  );
};

export default Gallery;
