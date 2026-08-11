import {
  SERIES_TEXT_ALIGNMENTS,
  SERIES_TEXT_FONTS,
  SERIES_TEXT_SIZES,
  assertSeriesBlockTypeCoverage,
  normalizeBlockType,
  normalizeSeriesBlockLayout,
  normalizeSeriesGroupItemLayout,
  normalizeSeriesTextOption
} from '@portfolio/series-content-contract';

assertSeriesBlockTypeCoverage(
  ['text', 'photo', 'photos'],
  'seriesEditorModel'
);

const seriesContentError = (message, field, details = {}) => {
  const error = new TypeError(message);
  error.code = 'VALIDATION_ERROR';
  error.details = { field, ...details };
  return error;
};

export const normalizeSeriesPhotoId = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeSeriesPhotoIds = (values) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((result, value) => {
    const id = normalizeSeriesPhotoId(value);
    if (!id || seen.has(id)) return result;
    seen.add(id);
    result.push(id);
    return result;
  }, []);
};

const nextBlockY = (content) => (
  (Array.isArray(content) ? content : []).reduce((bottom, block) => {
    const y = Number(block?.layout?.y) || 0;
    const height = Number(block?.layout?.h) || 0;
    return Math.max(bottom, y + height);
  }, 0) + 1
);

export const createSeriesEditorBlock = ({
  type,
  content = [],
  photoId = null,
  id,
  y = 0
}) => {
  const blockId = id || `block-${Date.now().toString(36)}`;
  const safeType = normalizeBlockType(type);
  const layout = normalizeSeriesBlockLayout(null, safeType, { fallbackY: y });

  if (safeType === 'photo') {
    return {
      id: blockId,
      type: safeType,
      content: normalizeSeriesPhotoId(photoId),
      layout,
      showTitle: true,
      showLightbox: true
    };
  }

  if (safeType === 'photos') {
    return {
      id: blockId,
      type: safeType,
      content: normalizeSeriesPhotoIds(content).map((itemId) => ({ id: itemId })),
      layout
    };
  }

  if (safeType !== 'text') {
    throw seriesContentError(
      `Creazione editor non implementata per il blocco "${safeType}".`,
      'content.type'
    );
  }

  return {
    id: blockId,
    type: 'text',
    content: '',
    layout,
    textAlign: 'left',
    textSize: 'base',
    textBold: false,
    textItalic: false,
    textUnderline: false,
    textMono: false,
    textFont: 'inter'
  };
};

const normalizeGroupItems = (items, allowedPhotoIds, parentLayout, blockIndex) => {
  if (!Array.isArray(items)) {
    throw seriesContentError(
      'Il blocco photos deve contenere un array.',
      `content[${blockIndex}].content`
    );
  }
  const seen = new Set();
  return items.reduce((result, item, itemIndex) => {
    const field = `content[${blockIndex}].content[${itemIndex}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw seriesContentError(
        'Ogni elemento di un gruppo photos deve avere la forma { id, layout? }.',
        field
      );
    }
    const id = normalizeSeriesPhotoId(item.id);
    if (!id) {
      throw seriesContentError('ID foto non valido nel gruppo.', `${field}.id`);
    }
    if (!allowedPhotoIds.has(id)) {
      throw seriesContentError(
        'Il gruppo riferisce una foto che non appartiene alla serie.',
        `${field}.id`,
        { photoId: id }
      );
    }
    if (seen.has(id)) {
      throw seriesContentError(
        'La stessa foto non può comparire due volte nello stesso gruppo.',
        `${field}.id`,
        { photoId: id }
      );
    }
    seen.add(id);
    result.push({
      ...item,
      id,
      ...(item.layout
        ? { layout: normalizeSeriesGroupItemLayout(item.layout, parentLayout) }
        : {})
    });
    return result;
  }, []);
};

export const normalizeSeriesEditorContent = (content, photoIds) => {
  if (content === undefined || content === null) return [];
  if (!Array.isArray(content)) {
    throw seriesContentError('Il contenuto della serie deve essere un array.', 'content');
  }
  const allowedPhotoIds = new Set(normalizeSeriesPhotoIds(photoIds));
  return content.reduce((result, block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw seriesContentError('Ogni blocco serie deve essere un oggetto.', `content[${index}]`);
    }
    const type = normalizeBlockType(block.type, { field: `content[${index}].type` });
    const id = String(block.id || `block-${index}`);
    const layout = normalizeSeriesBlockLayout(block.layout, type, {
      fallbackY: nextBlockY(result)
    });

    if (type === 'photo') {
      const photoId = normalizeSeriesPhotoId(block.content);
      if (!photoId) {
        throw seriesContentError('Il blocco photo non contiene un ID valido.', `content[${index}].content`);
      }
      if (!allowedPhotoIds.has(photoId)) {
        throw seriesContentError(
          'Il blocco photo riferisce una foto che non appartiene alla serie.',
          `content[${index}].content`,
          { photoId }
        );
      }
      result.push({
        ...block,
        id,
        type,
        content: photoId,
        layout,
        showTitle: block.showTitle !== false,
        showLightbox: block.showLightbox !== false
      });
      return result;
    }

    if (type === 'photos') {
      result.push({
        ...block,
        id,
        type,
        content: normalizeGroupItems(block.content, allowedPhotoIds, layout, index),
        layout
      });
      return result;
    }

    if (type === 'text') {
      if (typeof block.content !== 'string') {
        throw seriesContentError(
          'Il contenuto di un blocco text deve essere una stringa.',
          `content[${index}].content`
        );
      }
      result.push({
        ...createSeriesEditorBlock({ type: 'text', id, y: layout.y }),
        ...block,
        id,
        type,
        content: block.content,
        layout,
        textAlign: normalizeSeriesTextOption(
          block.textAlign,
          SERIES_TEXT_ALIGNMENTS,
          'left',
          `content[${index}].textAlign`
        ),
        textSize: normalizeSeriesTextOption(
          block.textSize,
          SERIES_TEXT_SIZES,
          'base',
          `content[${index}].textSize`
        ),
        textFont: normalizeSeriesTextOption(
          block.textFont,
          SERIES_TEXT_FONTS,
          'inter',
          `content[${index}].textFont`
        )
      });
    }
    return result;
  }, []);
};

export const removePhotoFromSeriesContent = (content, photoId) => {
  const targetId = normalizeSeriesPhotoId(photoId);
  if (!targetId) return Array.isArray(content) ? content : [];
  return (Array.isArray(content) ? content : []).reduce((result, block, index) => {
    const type = normalizeBlockType(block?.type, { field: `content[${index}].type` });
    if (type === 'photo' && normalizeSeriesPhotoId(block.content) === targetId) {
      return result;
    }
    if (type === 'photos') {
      result.push({
        ...block,
        content: (Array.isArray(block.content) ? block.content : []).filter((item) => (
          normalizeSeriesPhotoId(
            item && typeof item === 'object' ? item.id : item
          ) !== targetId
        ))
      });
      return result;
    }
    result.push(block);
    return result;
  }, []);
};

export const togglePhotoInSeriesGroup = (block, photoId) => {
  const targetId = normalizeSeriesPhotoId(photoId);
  if (!targetId) return block;
  const type = normalizeBlockType(block?.type);
  if (type !== 'photos') {
    throw seriesContentError('Il blocco selezionato non è un gruppo photos.', 'content.type');
  }
  const items = Array.isArray(block.content) ? block.content : [];
  const isSelected = items.some((item) => (
    normalizeSeriesPhotoId(item && typeof item === 'object' ? item.id : item) === targetId
  ));
  return {
    ...block,
    content: isSelected
      ? items.filter((item) => (
        normalizeSeriesPhotoId(item && typeof item === 'object' ? item.id : item) !== targetId
      ))
      : [...items, { id: targetId }]
  };
};

export const getSeriesBlockPhotoIds = (block) => {
  const type = normalizeBlockType(block?.type);
  if (type === 'photo') {
    const id = normalizeSeriesPhotoId(block.content);
    return id ? [id] : [];
  }
  if (type === 'photos') {
    return normalizeSeriesPhotoIds(
      (Array.isArray(block.content) ? block.content : []).map((item) => (
        item && typeof item === 'object' ? item.id : item
      ))
    );
  }
  if (type === 'text') return [];
  throw seriesContentError(
    `Riferimenti foto non implementati per il blocco "${type}".`,
    'content.type'
  );
};

export const appendMissingSeriesPhotoBlocks = (content, photoIds, createId) => {
  const current = Array.isArray(content) ? content : [];
  const referenced = new Set(current.flatMap(getSeriesBlockPhotoIds));
  let nextY = nextBlockY(current);
  const additions = normalizeSeriesPhotoIds(photoIds)
    .filter((photoId) => !referenced.has(photoId))
    .map((photoId, index) => {
      const block = createSeriesEditorBlock({
        type: 'photo',
        photoId,
        id: createId(photoId, index),
        y: nextY
      });
      nextY += block.layout.h + 1;
      return block;
    });
  return [...current, ...additions];
};

export const moveSeriesContentBlock = (content, index, direction) => {
  const next = [...(Array.isArray(content) ? content : [])];
  const target = index + direction;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) {
    return next;
  }
  const sourceY = Number(next[index]?.layout?.y) || 0;
  const targetY = Number(next[target]?.layout?.y) || 0;
  [next[index], next[target]] = [next[target], next[index]];
  next[index] = {
    ...next[index],
    layout: {
      ...next[index].layout,
      y: sourceY
    }
  };
  next[target] = {
    ...next[target],
    layout: {
      ...next[target].layout,
      y: targetY
    }
  };
  return next;
};

export const isSeriesEditorBlockComplete = (block) => {
  if (block?.type === 'text') return Boolean(String(block.content || '').trim());
  return getSeriesBlockPhotoIds(block).length > 0;
};
