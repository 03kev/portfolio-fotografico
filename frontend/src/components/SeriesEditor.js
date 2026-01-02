import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import { useToast } from './Toast';
import { IMAGES_BASE_URL } from '../utils/constants';

const EditorOverlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  z-index: var(--z-modal);
  overflow-y: auto;
  padding: var(--spacing-2xl);
`;

const EditorContainer = styled(motion.div)`
  max-width: 1200px;
  margin: 0 auto;
  background: rgba(26, 26, 26, 0.95);
  border-radius: var(--border-radius-2xl);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
`;

const EditorHeader = styled.div`
  padding: var(--spacing-2xl);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
`;

const EditorTitle = styled.h2`
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-white);
`;

const CloseButton = styled(motion.button)`
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--color-white);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  font-size: var(--font-size-xl);
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const EditorBody = styled.div`
  padding: var(--spacing-2xl);
`;

const FormGroup = styled.div`
  margin-bottom: var(--spacing-xl);
`;

const Label = styled.label`
  display: block;
  color: var(--color-white);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-base);
`;

const Input = styled.input`
  width: 100%;
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--border-radius);
  color: var(--color-white);
  font-size: var(--font-size-base);
  transition: all var(--transition-normal);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    background: rgba(255, 255, 255, 0.08);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--border-radius);
  color: var(--color-white);
  font-size: var(--font-size-base);
  min-height: 100px;
  resize: vertical;
  font-family: inherit;
  transition: all var(--transition-normal);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    background: rgba(255, 255, 255, 0.08);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const SectionTitle = styled.h3`
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-white);
  margin: var(--spacing-2xl) 0 var(--spacing-lg);
  padding-top: var(--spacing-2xl);
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
`;

const ContentBlocks = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
`;

const ContentBlock = styled(motion.div)`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-lg);
  position: relative;
`;

const BlockHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
`;

const BlockType = styled.span`
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
`;

const DeleteBlockButton = styled(motion.button)`
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const AddBlockButtons = styled.div`
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
`;

const AddBlockButton = styled(motion.button)`
  background: var(--primary-gradient);
  border: none;
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);

  &:hover {
    opacity: 0.9;
  }
`;

const PhotoSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--spacing-md);
  max-height: 300px;
  overflow-y: auto;
  padding: var(--spacing-md);
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--border-radius);
`;

const PhotoOption = styled(motion.div)`
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--border-radius);
  overflow: hidden;
  cursor: pointer;
  border: 2px solid ${props => props.selected ? 'var(--color-primary)' : 'transparent'};

  &:hover {
    border-color: var(--color-primary);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const SelectedBadge = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--color-primary);
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xs);
`;

const EditorFooter = styled.div`
  padding: var(--spacing-2xl);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.5);
`;

const Button = styled(motion.button)`
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--border-radius);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
  cursor: pointer;
  border: none;
  transition: all var(--transition-normal);
`;

const CancelButton = styled(Button)`
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-white);

  &:hover {
    background: rgba(255, 255, 255, 0.15);
  }
`;

const SaveButton = styled(Button)`
  background: var(--primary-gradient);
  color: var(--color-white);

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeleteButton = styled(Button)`
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  margin-right: auto;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: var(--color-white);
  cursor: pointer;
`;

function SeriesEditor({ series, onClose }) {
  const { createSeries, updateSeries, deleteSeries } = useSeries();
  const { photos } = usePhotos();
  const toast = useToast();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    coverImage: '',
    photos: [],
    content: [],
    published: false,
  });

  const [showAdvancedContent, setShowAdvancedContent] = useState(false);

  useEffect(() => {
    if (series) {
      setFormData({
        title: series.title || '',
        description: series.description || '',
        coverImage: series.coverImage || '',
        photos: series.photos || [],
        content: series.content || [],
        published: series.published || false,
      });
    }
  }, [series]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handlePhotoToggle = (photoId) => {
    setFormData(prev => {
      const isRemoving = prev.photos.includes(photoId);
      return {
        ...prev,
        photos: isRemoving
          ? prev.photos.filter(id => id !== photoId)
          : [...prev.photos, photoId],
        // Se rimuoviamo la foto di copertina, resettiamo coverImage
        coverImage: isRemoving && prev.coverImage === photoId ? '' : prev.coverImage
      };
    });
  };

  const addContentBlock = (type) => {
    const newBlock = {
      type,
      content: type === 'text' ? '' : type === 'photo' ? '' : [],
      order: formData.content.length
    };
    setFormData(prev => ({
      ...prev,
      content: [...prev.content, newBlock]
    }));
  };

  const updateContentBlock = (index, content) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content.map((block, i) => 
        i === index ? { ...block, content } : block
      )
    }));
  };

  const deleteContentBlock = (index) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (series) {
        await updateSeries(series.id, formData);
        toast.success('Serie aggiornata con successo! ✨');
      } else {
        await createSeries(formData);
        toast.success('Serie creata con successo! 🎉');
      }
      onClose();
    } catch (error) {
      toast.error(`Errore: ${error.message || 'Impossibile salvare la serie'}`);
    }
  };

  const handleDelete = async () => {
    if (!series) return;
    
    const confirmed = window.confirm(
      `Sei sicuro di voler eliminare la serie "${series.title}"?\n\nQuesta azione non può essere annullata.`
    );
    
    if (confirmed) {
      try {
        await deleteSeries(series.id);
        toast.success('Serie eliminata con successo! 🗑️');
        onClose();
        // Naviga alla home dopo l'eliminazione
        window.location.href = '/';
      } catch (error) {
        toast.error(`Errore nell'eliminazione: ${error.message || 'Impossibile eliminare la serie'}`);
      }
    }
  };

  return (
    <EditorOverlay
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <EditorContainer
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <EditorHeader>
            <EditorTitle>{series ? 'Modifica Serie' : 'Nuova Serie'}</EditorTitle>
            <CloseButton
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              ✕
            </CloseButton>
          </EditorHeader>

          <EditorBody>
            <FormGroup>
              <Label htmlFor="title">Titolo *</Label>
              <Input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Es: Paesaggi Islandesi"
                required
              />
            </FormGroup>

            <FormGroup>
              <Label htmlFor="description">Descrizione *</Label>
              <TextArea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Descrivi la tua serie fotografica..."
                required
              />
            </FormGroup>

            <FormGroup>
              <CheckboxLabel>
                <Checkbox
                  type="checkbox"
                  name="published"
                  checked={formData.published}
                  onChange={handleInputChange}
                />
                Pubblica serie (visibile pubblicamente)
              </CheckboxLabel>
            </FormGroup>

            <SectionTitle>Seleziona Foto</SectionTitle>
            <PhotoSelector>
              {photos.map(photo => (
                <PhotoOption
                  key={photo.id}
                  selected={formData.photos.includes(photo.id)}
                  onClick={() => handlePhotoToggle(photo.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <img 
                    src={`${IMAGES_BASE_URL}${photo.thumbnail || photo.image}`} 
                    alt={photo.title}
                  />
                  {formData.photos.includes(photo.id) && (
                    <SelectedBadge>✓</SelectedBadge>
                  )}
                </PhotoOption>
              ))}
            </PhotoSelector>

            {formData.photos.length > 0 && (
              <>
                <SectionTitle>Immagine di Copertina</SectionTitle>
                <Label>Seleziona quale foto usare come copertina della serie</Label>
                <PhotoSelector>
                  {photos.filter(p => formData.photos.includes(p.id)).map(photo => (
                    <PhotoOption
                      key={photo.id}
                      selected={formData.coverImage === photo.id}
                      onClick={() => setFormData(prev => ({ ...prev, coverImage: photo.id }))}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <img 
                        src={`${IMAGES_BASE_URL}${photo.thumbnail || photo.image}`} 
                        alt={photo.title}
                      />
                      {formData.coverImage === photo.id && (
                        <SelectedBadge>★</SelectedBadge>
                      )}
                    </PhotoOption>
                  ))}
                </PhotoSelector>
              </>
            )}

            <SectionTitle>Layout & Contenuto</SectionTitle>
            <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: 'var(--spacing-sm)' }}>
              Il contenuto (foto/paragrafi) lo componi principalmente dalla pagina della serie usando <b>Layout (drag/resize)</b>.
              Qui sotto puoi comunque modificare i blocchi, ma è una modalità avanzata.
            </p>

            <AddBlockButton
              type="button"
              onClick={() => setShowAdvancedContent(v => !v)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{ marginTop: 'var(--spacing-lg)' }}
            >
              {showAdvancedContent ? 'Nascondi contenuto avanzato' : 'Mostra contenuto avanzato'}
            </AddBlockButton>

            {showAdvancedContent && (
              <>
                <ContentBlocks>
                  <AnimatePresence>
                    {formData.content.map((block, index) => (
                      <ContentBlock
                        key={index}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                      >
                        <BlockHeader>
                          <BlockType>
                            {block.type === 'text' ? '📝 Paragrafo' : block.type === 'photo' ? '📷 Foto' : '📷 Gruppo Foto'}
                          </BlockType>
                          <DeleteBlockButton
                            type="button"
                            onClick={() => deleteContentBlock(index)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Elimina
                          </DeleteBlockButton>
                        </BlockHeader>

                        {block.type === 'text' ? (
                          <TextArea
                            value={block.content}
                            onChange={(e) => updateContentBlock(index, e.target.value)}
                            placeholder="Scrivi il tuo paragrafo..."
                          />
                        ) : block.type === 'photo' ? (
                          <>
                            <Label>Seleziona una singola foto (poi la posizioni e ridimensioni dalla pagina della serie)</Label>
                            <PhotoSelector>
                              {photos.filter(p => formData.photos.includes(p.id)).map(photo => (
                                <PhotoOption
                                  key={photo.id}
                                  selected={block.content === photo.id}
                                  onClick={() => updateContentBlock(index, photo.id)}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <img 
                                    src={`${IMAGES_BASE_URL}${photo.thumbnail || photo.image}`} 
                                    alt={photo.title}
                                  />
                                  {block.content === photo.id && (
                                    <SelectedBadge>✓</SelectedBadge>
                                  )}
                                </PhotoOption>
                              ))}
                            </PhotoSelector>
                          </>
                        ) : (
                          <>
                            <Label>Seleziona un gruppo di foto</Label>
                            <PhotoSelector>
                              {photos.filter(p => formData.photos.includes(p.id)).map(photo => (
                                <PhotoOption
                                  key={photo.id}
                                  selected={block.content.includes(photo.id)}
                                  onClick={() => {
                                    const newContent = block.content.includes(photo.id)
                                      ? block.content.filter(id => id !== photo.id)
                                      : [...block.content, photo.id];
                                    updateContentBlock(index, newContent);
                                  }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <img 
                                    src={`${IMAGES_BASE_URL}${photo.thumbnail || photo.image}`} 
                                    alt={photo.title}
                                  />
                                  {block.content.includes(photo.id) && (
                                    <SelectedBadge>✓</SelectedBadge>
                                  )}
                                </PhotoOption>
                              ))}
                            </PhotoSelector>
                          </>
                        )}
                      </ContentBlock>
                    ))}
                  </AnimatePresence>
                </ContentBlocks>

                <AddBlockButtons>
                  <AddBlockButton
                    type="button"
                    onClick={() => addContentBlock('text')}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>📝</span> Aggiungi Paragrafo
                  </AddBlockButton>
                  <AddBlockButton
                    type="button"
                    onClick={() => addContentBlock('photo')}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>📷</span> Aggiungi Foto
                  </AddBlockButton>
                  <AddBlockButton
                    type="button"
                    onClick={() => addContentBlock('photos')}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span>📷</span> Aggiungi Gruppo Foto
                  </AddBlockButton>
                </AddBlockButtons>
              </>
            )}
          </EditorBody>

          <EditorFooter>
            {series && (
              <DeleteButton
                type="button"
                onClick={handleDelete}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                🗑️ Elimina Serie
              </DeleteButton>
            )}
            <CancelButton
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Annulla
            </CancelButton>
            <SaveButton
              type="submit"
              disabled={!formData.title || !formData.description}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {series ? 'Aggiorna Serie' : 'Crea Serie'}
            </SaveButton>
          </EditorFooter>
        </form>
      </EditorContainer>
    </EditorOverlay>
  );
}

export default SeriesEditor;
