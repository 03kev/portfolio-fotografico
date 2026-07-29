const GRID_COLUMNS = 24;

const DEFAULT_LAYOUTS = Object.freeze({
  text: Object.freeze({ x: 0, w: 14, h: 5 }),
  photo: Object.freeze({ x: 0, w: 16, h: 22 }),
  photos: Object.freeze({ x: 0, w: GRID_COLUMNS, h: 24 })
});

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

const normalizeLayout = (layout, type, y = 0) => {
  const defaults = DEFAULT_LAYOUTS[type] || DEFAULT_LAYOUTS.text;
  const source = layout && typeof layout === 'object' ? layout : {};
  return {
    x: Number.isFinite(Number(source.x)) ? Number(source.x) : defaults.x,
    y: Number.isFinite(Number(source.y)) ? Number(source.y) : y,
    w: Number.isFinite(Number(source.w)) ? Number(source.w) : defaults.w,
    h: Number.isFinite(Number(source.h)) ? Number(source.h) : defaults.h,
    unit: 'grid'
  };
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
  const safeType = ['text', 'photo', 'photos'].includes(type) ? type : 'text';
  const layout = normalizeLayout(null, safeType, y);

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

const normalizeGroupItems = (items, allowedPhotoIds) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).reduce((result, item) => {
    const id = normalizeSeriesPhotoId(
      item && typeof item === 'object' ? item.id ?? item.photoId ?? item.content : item
    );
    if (!id || !allowedPhotoIds.has(id) || seen.has(id)) return result;
    seen.add(id);
    result.push(
      item && typeof item === 'object'
        ? { ...item, id }
        : { id }
    );
    return result;
  }, []);
};

export const normalizeSeriesEditorContent = (content, photoIds) => {
  const allowedPhotoIds = new Set(normalizeSeriesPhotoIds(photoIds));
  return (Array.isArray(content) ? content : []).reduce((result, block, index) => {
    if (!block || typeof block !== 'object') return result;
    const type = block.type === 'image' ? 'photo' : block.type;
    const id = String(block.id || `block-${index}`);
    const layout = normalizeLayout(block.layout, type, nextBlockY(result));

    if (type === 'photo') {
      const photoId = normalizeSeriesPhotoId(block.content);
      if (!photoId || !allowedPhotoIds.has(photoId)) return result;
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
        content: normalizeGroupItems(block.content, allowedPhotoIds),
        layout
      });
      return result;
    }

    if (type === 'text') {
      result.push({
        ...createSeriesEditorBlock({ type: 'text', id, y: layout.y }),
        ...block,
        id,
        type,
        content: String(block.content || ''),
        layout
      });
    }
    return result;
  }, []);
};

export const removePhotoFromSeriesContent = (content, photoId) => {
  const targetId = normalizeSeriesPhotoId(photoId);
  if (!targetId) return Array.isArray(content) ? content : [];
  return (Array.isArray(content) ? content : []).reduce((result, block) => {
    if (block?.type === 'photo' && normalizeSeriesPhotoId(block.content) === targetId) {
      return result;
    }
    if (block?.type === 'photos') {
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
  if (!targetId || block?.type !== 'photos') return block;
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
  if (block?.type === 'photo') {
    const id = normalizeSeriesPhotoId(block.content);
    return id ? [id] : [];
  }
  if (block?.type === 'photos') {
    return normalizeSeriesPhotoIds(
      (Array.isArray(block.content) ? block.content : []).map((item) => (
        item && typeof item === 'object' ? item.id : item
      ))
    );
  }
  return [];
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
