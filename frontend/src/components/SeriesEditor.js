import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Images,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import { useToast } from './Toast';
import PhotoUploadShell from './photoUpload/PhotoUploadShell';
import { resolvePhotoAssetUrl } from '../utils/imageUrl';
import { adminFeedback } from '../utils/adminFeedback';
import { buildOperationErrorMessage } from '../utils/operationErrors';
import AdminConfirmDialog from './AdminConfirmDialog';
import {
  appendMissingSeriesPhotoBlocks,
  createSeriesEditorBlock,
  getSeriesBlockPhotoIds,
  isSeriesEditorBlockComplete,
  moveSeriesContentBlock,
  normalizeSeriesEditorContent,
  normalizeSeriesPhotoIds,
  removePhotoFromSeriesContent,
  togglePhotoInSeriesGroup
} from '../utils/seriesEditorModel';
import './PhotoUpload.css';
import './SeriesEditor.css';

const STEPS = Object.freeze([
  {
    id: 1,
    label: 'Dettagli',
    description: 'Definisci identità, descrizione e stato della serie.'
  },
  {
    id: 2,
    label: 'Foto & copertina',
    description: 'Scegli le fotografie e l’immagine di copertina.'
  },
  {
    id: 3,
    label: 'Struttura',
    description: 'Costruisci la sequenza narrativa; il layout preciso si rifinisce dopo il salvataggio.'
  }
]);

const makeBlockId = (type = 'block') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `block-${type}-${crypto.randomUUID()}`;
  }
  return `block-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
};

const buildInitialForm = (series) => {
  const photos = normalizeSeriesPhotoIds(series?.photos);
  const requestedCover = Number(series?.coverImage);
  return {
    title: String(series?.title || ''),
    description: String(series?.description || ''),
    coverImage: photos.includes(requestedCover) ? requestedCover : null,
    photos,
    content: normalizeSeriesEditorContent(series?.content, photos),
    published: series?.published === true
  };
};

const getPhotoSearchText = (photo) => [
  photo?.title,
  photo?.description,
  photo?.location,
  ...(Array.isArray(photo?.tags) ? photo.tags : [])
]
  .filter(Boolean)
  .join(' ')
  .toLocaleLowerCase('it-IT');

const SeriesEditor = ({ series, onClose }) => {
  const navigate = useNavigate();
  const {
    series: existingSeries,
    createSeries,
    updateSeries,
    deleteSeries
  } = useSeries();
  const { photos } = usePhotos();
  const toast = useToast();
  const closeTimerRef = useRef(null);
  const blockElementRefs = useRef(new Map());
  const pendingBlockScrollRef = useRef(null);
  const baseVersionRef = useRef(series?.version);
  const isEditMode = Boolean(series);

  const [formData, setFormData] = useState(() => buildInitialForm(series));
  const [currentStep, setCurrentStep] = useState(1);
  const [photoQuery, setPhotoQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const currentStepIndex = STEPS.findIndex((step) => step.id === currentStep);
  const currentStepData = STEPS[currentStepIndex] || STEPS[0];
  const normalizedTitle = formData.title
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT');
  const detailsAreValid = (
    formData.title.trim().length >= 3
    && Boolean(formData.description.trim())
  );
  const titleConflict = useMemo(() => existingSeries.some((item) => (
    String(item.id) !== String(series?.id ?? '')
    && String(item.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('it-IT') === normalizedTitle
  )), [existingSeries, normalizedTitle, series?.id]);

  const photosById = useMemo(
    () => new Map(photos.map((photo) => [Number(photo.id), photo])),
    [photos]
  );
  const selectedPhotos = useMemo(
    () => formData.photos.map((id) => photosById.get(id)).filter(Boolean),
    [formData.photos, photosById]
  );
  const normalizedQuery = photoQuery.trim().toLocaleLowerCase('it-IT');
  const filteredPhotos = useMemo(() => (
    normalizedQuery
      ? photos.filter((photo) => getPhotoSearchText(photo).includes(normalizedQuery))
      : photos
  ), [normalizedQuery, photos]);
  const referencedPhotoIds = useMemo(
    () => new Set(formData.content.flatMap(getSeriesBlockPhotoIds)),
    [formData.content]
  );
  const missingPhotoCount = formData.photos.filter(
    (photoId) => !referencedPhotoIds.has(photoId)
  ).length;
  const incompleteBlockCount = formData.content.filter(
    (block) => !isSeriesEditorBlockComplete(block)
  ).length;
  const coverPhoto = formData.coverImage
    ? photosById.get(Number(formData.coverImage))
    : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      if (deleteDialogOpen) {
        setDeleteDialogOpen(false);
      } else {
        setIsClosing(true);
        closeTimerRef.current = window.setTimeout(onClose, 220);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [deleteDialogOpen, isSubmitting, onClose]);

  useEffect(() => {
    const blockId = pendingBlockScrollRef.current;
    if (currentStep !== 3 || !blockId) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const element = blockElementRefs.current.get(blockId);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
      pendingBlockScrollRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentStep, formData.content]);

  const initClose = () => {
    if (isSubmitting || isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 220);
  };

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value
    }));
    setFormError('');
  };

  const validateDetails = () => {
    if (formData.title.trim().length < 3) {
      setFormError('Il titolo deve contenere almeno 3 caratteri.');
      return false;
    }
    if (!formData.description.trim()) {
      setFormError('La descrizione è obbligatoria.');
      return false;
    }
    if (titleConflict) {
      setFormError('Questo titolo è già utilizzato da un’altra serie o bozza.');
      return false;
    }
    setFormError('');
    return true;
  };

  const goToStep = (stepId) => {
    if (isSubmitting || stepId === currentStep) return;
    if (stepId > 1 && !validateDetails()) {
      setCurrentStep(1);
      return;
    }
    if (stepId === 3 && formData.content.length === 0 && formData.photos.length > 0) {
      setFormData((previous) => ({
        ...previous,
        content: appendMissingSeriesPhotoBlocks(
          previous.content,
          previous.photos,
          (photoId) => makeBlockId(`photo-${photoId}`)
        )
      }));
    }
    setCurrentStep(stepId);
    setFormError('');
  };
  const goToStepRef = useRef(goToStep);
  goToStepRef.current = goToStep;

  useEffect(() => {
    const handleStepShortcut = (event) => {
      if (
        isSubmitting
        || deleteDialogOpen
        || event.metaKey
        || event.ctrlKey
        || event.altKey
      ) {
        return;
      }

      const activeElement = document.activeElement;
      const isTypingTarget = activeElement && (
        activeElement.tagName === 'INPUT'
        || activeElement.tagName === 'TEXTAREA'
        || activeElement.tagName === 'SELECT'
        || activeElement.isContentEditable
      );

      if (isTypingTarget || !['1', '2', '3'].includes(event.key)) return;

      const targetStep = STEPS[Number(event.key) - 1]?.id;
      if (targetStep && targetStep !== currentStep) {
        event.preventDefault();
        goToStepRef.current(targetStep);
      }
    };

    document.addEventListener('keydown', handleStepShortcut);
    return () => document.removeEventListener('keydown', handleStepShortcut);
  }, [currentStep, deleteDialogOpen, isSubmitting]);

  const handlePhotoToggle = (photoId) => {
    const normalizedId = Number(photoId);
    setFormData((previous) => {
      const isRemoving = previous.photos.includes(normalizedId);
      if (isRemoving) {
        const nextPhotos = previous.photos.filter((id) => id !== normalizedId);
        return {
          ...previous,
          photos: nextPhotos,
          coverImage: previous.coverImage === normalizedId
            ? (nextPhotos[0] || null)
            : previous.coverImage,
          content: removePhotoFromSeriesContent(previous.content, normalizedId)
        };
      }
      const nextPhotos = [...previous.photos, normalizedId];
      return {
        ...previous,
        photos: nextPhotos,
        coverImage: previous.coverImage || normalizedId
      };
    });
  };

  const setCoverPhoto = (event, photoId) => {
    event.stopPropagation();
    setFormData((previous) => ({
      ...previous,
      coverImage: Number(photoId)
    }));
  };

  const addContentBlock = (type) => {
    const blockId = makeBlockId(type);
    pendingBlockScrollRef.current = blockId;
    setExpandedBlockId(blockId);
    setFormData((previous) => {
      const used = new Set(previous.content.flatMap(getSeriesBlockPhotoIds));
      const firstUnused = previous.photos.find((photoId) => !used.has(photoId));
      const firstSelected = firstUnused || previous.photos[0] || null;
      const block = createSeriesEditorBlock({
        type,
        photoId: type === 'photo' ? firstSelected : null,
        content: [],
        id: blockId,
        y: previous.content.reduce((bottom, item) => (
          Math.max(bottom, (Number(item?.layout?.y) || 0) + (Number(item?.layout?.h) || 0))
        ), 0) + 1
      });
      return {
        ...previous,
        content: [...previous.content, block]
      };
    });
  };

  const updateContentBlock = (index, updater) => {
    setFormData((previous) => ({
      ...previous,
      content: previous.content.map((block, blockIndex) => (
        blockIndex === index
          ? (typeof updater === 'function' ? updater(block) : { ...block, ...updater })
          : block
      ))
    }));
  };

  const removeContentBlock = (index) => {
    const removedBlockId = formData.content[index]?.id;
    if (removedBlockId && removedBlockId === expandedBlockId) {
      setExpandedBlockId(null);
    }
    setFormData((previous) => ({
      ...previous,
      content: previous.content.filter((_, blockIndex) => blockIndex !== index)
    }));
  };

  const moveContentBlock = (index, direction) => {
    setFormData((previous) => ({
      ...previous,
      content: moveSeriesContentBlock(previous.content, index, direction)
    }));
  };

  const addMissingPhotoBlocks = () => {
    const missingIds = formData.photos.filter(
      (photoId) => !referencedPhotoIds.has(photoId)
    );
    const blockIds = new Map(
      missingIds.map((photoId) => [photoId, makeBlockId(`photo-${photoId}`)])
    );
    const firstBlockId = blockIds.get(missingIds[0]);
    if (firstBlockId) {
      pendingBlockScrollRef.current = firstBlockId;
      setExpandedBlockId(firstBlockId);
    }
    setFormData((previous) => ({
      ...previous,
      content: appendMissingSeriesPhotoBlocks(
        previous.content,
        previous.photos,
        (photoId) => blockIds.get(photoId) || makeBlockId(`photo-${photoId}`)
      )
    }));
  };

  const handleSubmit = async () => {
    if (isSubmitting || !validateDetails()) {
      if (!detailsAreValid || titleConflict) setCurrentStep(1);
      return;
    }
    if (incompleteBlockCount > 0) {
      setCurrentStep(3);
      setFormError(
        incompleteBlockCount === 1
          ? 'Completa o rimuovi il blocco vuoto prima di salvare.'
          : `Completa o rimuovi i ${incompleteBlockCount} blocchi vuoti prima di salvare.`
      );
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      coverImage: formData.coverImage || null,
      photos: normalizeSeriesPhotoIds(formData.photos),
      content: normalizeSeriesEditorContent(formData.content, formData.photos),
      published: formData.published
    };

    setIsSubmitting(true);
    setFormError('');
    try {
      if (isEditMode) {
        const updatedSeries = await updateSeries(series.id, payload, {
          expectedVersion: baseVersionRef.current
        });
        toast.success(adminFeedback.seriesUpdated(updatedSeries));
        onClose();
        return;
      }

      const createdSeries = await createSeries(payload);
      toast.success(adminFeedback.seriesCreated(createdSeries));
      onClose();
      const identifier = createdSeries?.published
        ? (createdSeries.slug || createdSeries.id)
        : createdSeries?.id;
      if (identifier) navigate(`/series/${identifier}`);
    } catch (error) {
      setFormError(buildOperationErrorMessage(error, (
        isEditMode ? 'aggiornamento serie' : 'creazione serie'
      )));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!series || isSubmitting) return;
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!series || isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      await deleteSeries(series.id);
      toast.success(adminFeedback.seriesDeleted(series));
      onClose();
      navigate('/series', { replace: true });
    } catch (error) {
      setDeleteDialogOpen(false);
      setFormError(buildOperationErrorMessage(error, 'eliminazione serie'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPhotoGrid = ({
    sourcePhotos,
    selectedIds,
    onToggle,
    compact = false,
    showCoverAction = false
  }) => (
    <div className={`series-photo-grid${compact ? ' compact' : ''}`}>
      {sourcePhotos.map((photo) => {
        const photoId = Number(photo.id);
        const selected = selectedIds.includes(photoId);
        return (
          <div
            className={`series-photo-option${selected ? ' selected' : ''}`}
            key={photo.id}
          >
            <button
              type="button"
              className="series-photo-select"
              onClick={() => onToggle(photoId)}
              aria-pressed={selected}
              title={selected ? `Rimuovi ${photo.title}` : `Seleziona ${photo.title}`}
            >
              <img
                src={photo.assets?.['thumbnail-4x3']?.url
                  ? resolvePhotoAssetUrl(photo, 'thumbnail-4x3')
                  : '/photo-fallback.svg'}
                alt=""
                loading="lazy"
              />
              <span className="series-photo-shade" />
              {selected && (
                <span className="series-photo-selected-badge">
                  <Check size={14} />
                </span>
              )}
              <span className="series-photo-caption">{photo.title || 'Senza titolo'}</span>
            </button>
            {showCoverAction && selected && (
              <button
                type="button"
                className={`series-cover-action${formData.coverImage === photoId ? ' active' : ''}`}
                onClick={(event) => setCoverPhoto(event, photoId)}
                aria-label={`Usa ${photo.title} come copertina`}
                title="Imposta come copertina"
              >
                <Star
                  size={15}
                  fill={formData.coverImage === photoId ? 'currentColor' : 'none'}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderDetailsStep = () => (
    <div className="step-content series-editor-step">
      <div className="step-section-intro">
        <span className="step-section-kicker">Identità</span>
        <h3>Racconta il progetto</h3>
        <p>Queste informazioni compariranno nell’elenco delle serie e nei metadati SEO.</p>
      </div>

      <div className="series-details-layout">
        <div className="series-form-card">
          <div className="form-group">
            <label htmlFor="series-title">Titolo *</label>
            <input
              id="series-title"
              name="title"
              type="text"
              value={formData.title}
              onChange={updateField}
              minLength={3}
              maxLength={120}
              aria-invalid={titleConflict}
              aria-describedby={titleConflict ? 'series-title-conflict' : undefined}
              placeholder="Es. Frammenti di Varsavia"
            />
            {titleConflict && (
              <span id="series-title-conflict" className="series-field-error">
                Titolo già usato da un’altra serie o bozza.
              </span>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="series-description">Descrizione *</label>
            <textarea
              id="series-description"
              name="description"
              value={formData.description}
              onChange={updateField}
              maxLength={8000}
              placeholder="Descrivi il tema, il luogo o il filo narrativo della serie…"
            />
            <span className="series-character-count">
              {formData.description.length}/8000
            </span>
          </div>
        </div>

        <aside className="series-status-card">
          <div className="series-cover-preview">
            {coverPhoto?.assets?.['thumbnail-4x3']?.url ? (
              <img
                src={resolvePhotoAssetUrl(coverPhoto, 'thumbnail-4x3')}
                alt=""
              />
            ) : (
              <BookOpen size={34} />
            )}
          </div>
          <div>
            <span className="series-status-label">Stato della serie</span>
            <strong>{formData.published ? 'Pubblicata' : 'Bozza privata'}</strong>
            <p>
              {formData.published
                ? 'La serie sarà visibile nel sito e potrà essere indicizzata.'
                : 'La serie resterà privata finché non deciderai di pubblicarla.'}
            </p>
          </div>
          <label className="series-publish-toggle">
            <input
              type="checkbox"
              name="published"
              checked={formData.published}
              onChange={updateField}
            />
            <span className="series-toggle-track" aria-hidden="true">
              <span />
            </span>
            <span>Pubblica serie</span>
          </label>
        </aside>
      </div>
    </div>
  );

  const renderPhotosStep = () => (
    <div className="step-content series-editor-step">
      <div className="series-step-heading-row has-selection-summary">
        <div className="step-section-intro">
          <span className="step-section-kicker">Selezione</span>
          <h3>Foto e copertina</h3>
          <p>
            Tocca una foto per aggiungerla; usa la stella per scegliere la copertina.
            La sequenza si definisce nel passaggio Struttura.
          </p>
        </div>
        <div className="series-selection-summary">
          <strong>{formData.photos.length}</strong>
          <span>selezionate</span>
        </div>
      </div>

      <div className="series-search">
        <Search size={17} />
        <input
          type="search"
          value={photoQuery}
          onChange={(event) => setPhotoQuery(event.target.value)}
          placeholder="Cerca per titolo, luogo o tag…"
          aria-label="Cerca fotografie"
        />
        <span>{filteredPhotos.length}/{photos.length}</span>
      </div>

      {filteredPhotos.length > 0 ? renderPhotoGrid({
        sourcePhotos: filteredPhotos,
        selectedIds: formData.photos,
        onToggle: handlePhotoToggle,
        showCoverAction: true
      }) : (
        <div className="series-empty-state">
          <ImageIcon size={26} />
          <strong>Nessuna foto trovata</strong>
          <span>Prova a modificare la ricerca.</span>
        </div>
      )}
    </div>
  );

  const renderBlockEditor = (block, index) => {
    if (block.type === 'text') {
      return (
        <div className="series-block-body">
          <textarea
            value={block.content}
            onChange={(event) => updateContentBlock(index, {
              content: event.target.value
            })}
            maxLength={8000}
            placeholder="Scrivi il testo del paragrafo…"
          />
        </div>
      );
    }

    if (block.type === 'photo') {
      return (
        <div className="series-block-body">
          {selectedPhotos.length > 0 ? renderPhotoGrid({
            sourcePhotos: selectedPhotos,
            selectedIds: getSeriesBlockPhotoIds(block),
            onToggle: (photoId) => updateContentBlock(index, {
              content: photoId
            }),
            compact: true
          }) : (
            <div className="series-inline-hint">Seleziona prima almeno una foto.</div>
          )}
          <div className="series-block-options">
            <label>
              <input
                type="checkbox"
                checked={block.showTitle !== false}
                onChange={() => updateContentBlock(index, {
                  showTitle: block.showTitle === false
                })}
              />
              Mostra titolo
            </label>
            <label>
              <input
                type="checkbox"
                checked={block.showLightbox !== false}
                onChange={() => updateContentBlock(index, {
                  showLightbox: block.showLightbox === false
                })}
              />
              Apri nel modal
            </label>
          </div>
        </div>
      );
    }

    const groupIds = getSeriesBlockPhotoIds(block);
    return (
      <div className="series-block-body">
        {selectedPhotos.length > 0 ? renderPhotoGrid({
          sourcePhotos: selectedPhotos,
          selectedIds: groupIds,
          onToggle: (photoId) => updateContentBlock(
            index,
            (current) => togglePhotoInSeriesGroup(current, photoId)
          ),
          compact: true
        }) : (
          <div className="series-inline-hint">Seleziona prima almeno una foto.</div>
        )}
        <span className="series-inline-hint">
          {groupIds.length} foto nel gruppo
        </span>
      </div>
    );
  };

  const renderStructureStep = () => (
    <div className="step-content series-editor-step">
      <div className="series-step-heading-row">
        <div className="step-section-intro">
          <span className="step-section-kicker">Sequenza narrativa</span>
          <h3>Costruisci il contenuto</h3>
          <p>
            Aggiungi e riordina i blocchi. Posizione e dimensioni si regolano
            visualmente nella pagina della serie dopo il salvataggio.
          </p>
        </div>
        {missingPhotoCount > 0 && (
          <button
            type="button"
            className="series-auto-structure"
            onClick={addMissingPhotoBlocks}
          >
            <Sparkles size={16} />
            Inserisci {missingPhotoCount === 1 ? 'la foto mancante' : `${missingPhotoCount} foto mancanti`}
          </button>
        )}
      </div>

      <div className="series-block-palette" aria-label="Aggiungi un blocco">
        <span className="series-block-palette-label">Aggiungi blocco</span>
        <button type="button" onClick={() => addContentBlock('text')}>
          <FileText size={17} />
          Testo
        </button>
        <button
          type="button"
          onClick={() => addContentBlock('photo')}
          disabled={formData.photos.length === 0}
        >
          <ImageIcon size={17} />
          Foto
        </button>
        <button
          type="button"
          onClick={() => addContentBlock('photos')}
          disabled={formData.photos.length === 0}
        >
          <Images size={17} />
          Gruppo
        </button>
      </div>

      {formData.content.length > 0 ? (
        <div className="series-content-list">
          {formData.content.map((block, index) => {
            const blockId = block.id || `series-block-${index}`;
            const isExpanded = expandedBlockId === blockId;
            return (
              <article
                className={`series-content-block${isExpanded ? ' expanded' : ''}`}
                key={blockId}
                ref={(element) => {
                  if (element) {
                    blockElementRefs.current.set(blockId, element);
                  } else {
                    blockElementRefs.current.delete(blockId);
                  }
                }}
                tabIndex={-1}
              >
                <header>
                  <button
                    type="button"
                    className="series-block-toggle"
                    onClick={() => setExpandedBlockId(isExpanded ? null : blockId)}
                    aria-expanded={isExpanded}
                  >
                    <div className="series-block-identity">
                      <span>{index + 1}</span>
                      <div>
                        <strong>
                          {block.type === 'text'
                            ? 'Testo'
                            : block.type === 'photo'
                              ? 'Foto singola'
                              : 'Gruppo di foto'}
                        </strong>
                        <small>
                          {block.type === 'text'
                            ? (block.content.trim() || 'Paragrafo vuoto')
                            : block.type === 'photo'
                              ? (
                                photosById.get(getSeriesBlockPhotoIds(block)[0])?.title
                                || 'Nessuna foto scelta'
                              )
                              : `${getSeriesBlockPhotoIds(block).length} foto`}
                        </small>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </button>
                  <div className="series-block-actions">
                    <button
                      type="button"
                      onClick={() => moveContentBlock(index, -1)}
                      disabled={index === 0}
                      aria-label="Sposta prima"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveContentBlock(index, 1)}
                      disabled={index === formData.content.length - 1}
                      aria-label="Sposta dopo"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeContentBlock(index)}
                      aria-label="Elimina blocco"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </header>
                {isExpanded && renderBlockEditor(block, index)}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="series-empty-state large">
          <Plus size={28} />
          <strong>La struttura è ancora vuota</strong>
          <span>
            Usa i pulsanti qui sopra oppure torna alle foto: al passaggio successivo
            verrà proposta automaticamente una sequenza iniziale.
          </span>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="upload-actions series-editor-actions">
      <div className="upload-actions-meta">
        <span className="upload-actions-step">
          {isEditMode ? 'Modifica serie' : 'Nuova serie'}
        </span>
        <span className="upload-actions-caption">
          {currentStep === 1
            ? 'Compila i dati essenziali'
            : currentStep === 2
              ? `${formData.photos.length} foto · ${formData.coverImage ? 'copertina scelta' : 'nessuna copertina'}`
              : `${formData.content.length} blocchi${incompleteBlockCount ? ` · ${incompleteBlockCount} da completare` : ''}`}
        </span>
      </div>
      <div className="upload-actions-buttons">
        {isEditMode && currentStep === 1 && (
          <button
            type="button"
            className="series-delete-button"
            onClick={handleDelete}
            disabled={isSubmitting}
          >
            <Trash2 size={16} />
            Elimina
          </button>
        )}
        {currentStep > 1 && (
          <button
            type="button"
            className="cancel-btn"
            onClick={() => goToStep(currentStep - 1)}
            disabled={isSubmitting}
          >
            <ArrowLeft size={16} />
            Indietro
          </button>
        )}
        {currentStep < STEPS.length ? (
          <button
            type="button"
            className="upload-btn"
            onClick={() => goToStep(currentStep + 1)}
            disabled={isSubmitting || (currentStep === 1 && (!detailsAreValid || titleConflict))}
          >
            Avanti
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="upload-btn"
            onClick={handleSubmit}
            disabled={
              isSubmitting
              || !detailsAreValid
              || titleConflict
              || incompleteBlockCount > 0
            }
          >
            {isSubmitting ? <Loader2 className="series-spin" size={17} /> : <Save size={17} />}
            {isSubmitting
              ? 'Salvataggio…'
              : isEditMode
                ? 'Salva modifiche'
                : 'Crea serie'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="series-editor-modal">
      <PhotoUploadShell
        isEditMode={isEditMode}
        eyebrow={isEditMode ? 'Editor serie' : 'Nuovo progetto'}
        title={isEditMode ? 'Modifica Serie' : 'Crea Nuova Serie'}
        titleIcon={<BookOpen size={18} />}
        currentStepIndex={currentStepIndex}
        steps={STEPS}
        currentStep={currentStep}
        currentStepLabel={currentStepData.label}
        currentStepDescription={currentStepData.description}
        loading={isSubmitting}
        isClosing={isClosing}
        onInitClose={initClose}
        onStepSelect={goToStep}
        onBackdropClick={initClose}
        footer={footer}
      >
        <div className="steps-container">
          {currentStep === 1 && renderDetailsStep()}
          {currentStep === 2 && renderPhotosStep()}
          {currentStep === 3 && renderStructureStep()}
          {formError && (
            <div className="error-message series-editor-error" role="alert">
              {formError}
            </div>
          )}
        </div>
      </PhotoUploadShell>
      <AdminConfirmDialog
        open={deleteDialogOpen}
        title="Elimina serie"
        pending={isSubmitting}
        onCancel={() => {
          if (!isSubmitting) setDeleteDialogOpen(false);
        }}
        onConfirm={handleConfirmDelete}
      >
        Stai per eliminare definitivamente <strong>{series?.title || 'questa serie'}</strong>.
        Le fotografie resteranno nell&apos;archivio, ma la struttura editoriale della serie
        verrà rimossa.
      </AdminConfirmDialog>
    </div>
  );
};

export default SeriesEditor;
