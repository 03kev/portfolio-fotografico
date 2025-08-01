import React, { useState, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

const DEBOUNCE_DELAY_FILTER = 200;

function useDebounce(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debounced;
}

const cardVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4 } },
    exit:    { opacity: 0, scale: 0.8, y: -20, transition: { duration: 0.3 } }
};

const GallerySection = styled(motion.section)`
  padding-top: 125px !important;
  padding-bottom: 125px !important;
  padding: var(--spacing-4xl) 0;
  background: linear-gradient(135deg, #1a1a1a 0%, #0c0c0c 100%);
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const SectionTitle = styled(motion.h2)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-black);
  text-align: center;
  margin-bottom: var(--spacing-xl);
  background: var(--secondary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const FilterContainer = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-3xl);

  @media (max-width: 768px) {
    gap: var(--spacing-sm);
  }
`;

const FilterButton = styled(motion.button)`
  background: ${props => props.active 
? 'var(--accent-gradient)' 
: 'rgba(255, 255, 255, 0.1)'};
  color: var(--color-white);
  border: 1px solid ${props => props.active 
? 'transparent' 
: 'rgba(255, 255, 255, 0.2)'};
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    background: ${props => props.active 
? 'var(--accent-gradient)' 
: 'rgba(255, 255, 255, 0.15)'};
    transform: translateY(-2px);
  }

  @media (max-width: 768px) {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-xs);
  }
`;

const SearchContainer = styled(motion.div)`
  max-width: 500px;
  margin: 0 auto var(--spacing-2xl);
  position: relative;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: var(--spacing-md) var(--spacing-xl);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--border-radius-full);
  color: var(--color-white);
  font-size: var(--font-size-base);
  backdrop-filter: blur(10px);
  transition: all var(--transition-normal);

  &:focus {
    outline: none;
    border-color: var(--color-accent);
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 3px rgba(79, 172, 254, 0.1);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  right: var(--spacing-lg);
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
`;

const GalleryGrid = styled(motion.div).attrs({ layout: true })`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-xl);
  margin-top: var(--spacing-2xl);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
`;

const PhotoCard = styled(motion.div)`
  position: relative;
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  aspect-ratio: 4/3;
  cursor: pointer;
  background: var(--color-dark-light);
  box-shadow: var(--shadow-large);
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-10px);
    box-shadow: var(--shadow-2xl);
  }
`;

const PhotoImage = styled(motion.img)`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: all var(--transition-slow);

  ${PhotoCard}:hover & {
    transform: scale(1.1);
  }
`;

const PhotoOverlay = styled(motion.div)`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.9));
  padding: var(--spacing-2xl) var(--spacing-lg) var(--spacing-lg);
  transform: translateY(100%);
  transition: all var(--transition-normal);

  ${PhotoCard}:hover & {
    transform: translateY(0);
  }
`;

const PhotoTitle = styled.h3`
  color: var(--color-accent);
  margin: 0 0 var(--spacing-sm) 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
`;

const PhotoLocation = styled.p`
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 var(--spacing-sm) 0;
  font-size: var(--font-size-sm);
`;

const PhotoDescription = styled.p`
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.4;
`;

const PhotoTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
`;

const Tag = styled.span`
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  border-top-color: var(--color-accent);
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const NoResults = styled(motion.div)`
  text-align: center;
  padding: var(--spacing-3xl);
  color: rgba(255, 255, 255, 0.7);

  h3 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-md);
    color: var(--color-white);
  }

  p {
    font-size: var(--font-size-base);
  }
`;

const Gallery = () => {
    const { photos, filteredPhotos, loading, actions, filters } = usePhotos();
    
    // Inizializza lo stato locale con i valori del context
    const [activeFilter, setActiveFilter] = useState(() => {
        return filters.tags && filters.tags.length > 0 ? filters.tags[0] : 'all';
    });
    const [searchTerm, setSearchTerm] = useState(() => {
        return filters.search || '';
    });
    const debouncedSearchTerm = useDebounce(searchTerm, DEBOUNCE_DELAY_FILTER);
    
    const allTags = useMemo(() =>
        [...new Set(photos.flatMap(photo => Array.isArray(photo.tags) ? photo.tags : []))],
    [photos]);
    
    const filterOptions = useMemo(() => ['all', ...allTags], [allTags]);
    
    // Apply search + tag filters to context whenever inputs change (debounced)
    useEffect(() => {
        if (debouncedSearchTerm.trim()) {
            // c'è un testo di ricerca: applicalo sempre
            if (activeFilter !== 'all') {
                actions.setFilter({ search: debouncedSearchTerm, tags: [activeFilter] });
            } else {
                actions.setFilter({ search: debouncedSearchTerm, tags: [] });
            }
        } else {
            // campo ricerca vuoto: togli solo search, mantieni o togli i tag
            if (activeFilter !== 'all') {
                actions.setFilter({ search: '', tags: [activeFilter] });
            } else {
                actions.clearFilters(); // nessun filtro attivo
            }
        }
    }, [debouncedSearchTerm, activeFilter]);
    
    // Effetto per sincronizzare quando i filtri vengono impostati dall'esterno (es. PhotoModal)
    // Ma solo quando il componente non sta già gestendo l'aggiornamento
    useEffect(() => {
        const currentTag = filters.tags && filters.tags.length > 0 ? filters.tags[0] : 'all';
        const currentSearch = filters.search || '';
        
        // Aggiorna solo se i valori sono effettivamente diversi
        if (currentTag !== activeFilter) {
            setActiveFilter(currentTag);
        }
        if (currentSearch !== searchTerm) {
            setSearchTerm(currentSearch);
        }
    }, [filters.tags?.join(','), filters.search]); // Solo quando questi valori cambiano realmente
    
    const handleFilterClick = (filter) => {
        setActiveFilter(filter);
        
        // Se clicchiamo su "Tutti", resettiamo completamente i filtri
        if (filter === 'all') {
            actions.clearFilters();
            setSearchTerm('');
        }
    };
    
    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };
    
    const handlePhotoClick = (photo) => {
        actions.openPhotoModal(photo);
    };
    
    if (loading) {
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
        <GallerySection
        id="gallery"
        >
        <Container>
        <SectionTitle>
        Galleria Fotografica
        </SectionTitle>
        
        <SearchContainer>
        <SearchInput
        type="text"
        placeholder="Cerca per titolo, luogo o descrizione..."
        value={searchTerm}
        onChange={handleSearchChange}
        />
        <SearchIcon>🔍</SearchIcon>
        </SearchContainer>
        
        <FilterContainer>
        {filterOptions.map((filter, index) => (
            <FilterButton
            key={filter}
            active={activeFilter === filter}
            onClick={() => handleFilterClick(filter)}
            >
            {filter === 'all' ? 'Tutti' : filter}
            </FilterButton>
        ))}
        </FilterContainer>
        
        {filteredPhotos.length === 0 ? (
            <NoResults
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            >
            <h3>Nessuna foto trovata</h3>
            <p>Prova a modificare i filtri di ricerca</p>
            </NoResults>
        ) : (
            <GalleryGrid
            key="gallery-grid"
            >
            <AnimatePresence mode="popLayout" initial={false}>
            {filteredPhotos.map(photo => (
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
                <PhotoImage
                src={`${IMAGES_BASE_URL}${photo.image || photo.thumbnail}`}
                alt={photo.title}
                loading="eager"
                onError={(e) => {
                    e.target.src = `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop`;
                }}
                />
                <PhotoOverlay>
                <PhotoTitle>{photo.title}</PhotoTitle>
                <PhotoLocation>{photo.location}</PhotoLocation>
                <PhotoDescription>{photo.description}</PhotoDescription>
                {Array.isArray(photo.tags) && photo.tags.length > 0 && (
                    <PhotoTags>
                    {photo.tags.slice(0, 3).map(tag => (
                        <Tag key={tag}>{tag}</Tag>
                    ))}
                    </PhotoTags>
                )}
                </PhotoOverlay>
                </PhotoCard>
                </motion.div>
            ))}
            </AnimatePresence>
            </GalleryGrid>
        )}
        </Container>
        </GallerySection>
    );
};

export default Gallery;
