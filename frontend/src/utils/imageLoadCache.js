const loadedImageSources = new Set();

export function hasLoadedImageSource(src) {
  return Boolean(src && loadedImageSources.has(src));
}

export function markImageSourceLoaded(src) {
  if (!src) return;
  loadedImageSources.add(src);
}
