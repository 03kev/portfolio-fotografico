import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './index';

export const useGalleryQueryState = ({ debounceMs = 200 } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const photoParam = searchParams.get('photo');
  const activeFilter = searchParams.get('tag') || 'all';
  const urlSearchTerm = searchParams.get('search') || '';
  const [searchTerm, setSearchTerm] = useState(() => urlSearchTerm);
  const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

  useEffect(() => {
    setSearchTerm((current) => (current === urlSearchTerm ? current : urlSearchTerm));
  }, [searchParamsKey, urlSearchTerm]);

  const updateSearchParams = useCallback((mutateParams) => {
    const nextParams = new URLSearchParams(searchParams);
    mutateParams(nextParams);
    const nextKey = nextParams.toString();
    if (nextKey === searchParamsKey) return;
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, searchParamsKey, setSearchParams]);

  const handleFilterClick = useCallback((filter) => {
    updateSearchParams((nextParams) => {
      if (filter === 'all') {
        nextParams.delete('tag');
      } else {
        nextParams.set('tag', filter);
      }
    });
  }, [updateSearchParams]);

  const updateSearchValue = useCallback((nextValue) => {
    setSearchTerm(nextValue);

    updateSearchParams((nextParams) => {
      const normalizedSearch = nextValue.trim();
      if (normalizedSearch) {
        nextParams.set('search', normalizedSearch);
      } else {
        nextParams.delete('search');
      }
    });
  }, [updateSearchParams]);

  const handleSearchChange = useCallback((event) => {
    updateSearchValue(event.target.value);
  }, [updateSearchValue]);

  const clearSearch = useCallback(() => {
    updateSearchValue('');
  }, [updateSearchValue]);

  return useMemo(() => ({
    photoParam,
    activeFilter,
    searchTerm,
    debouncedSearchTerm,
    handleFilterClick,
    handleSearchChange,
    clearSearch
  }), [
    photoParam,
    activeFilter,
    searchTerm,
    debouncedSearchTerm,
    handleFilterClick,
    handleSearchChange,
    clearSearch
  ]);
};
