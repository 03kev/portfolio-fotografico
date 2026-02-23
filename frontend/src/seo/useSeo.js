import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BRAND_NAME = 'Kevin Muka';
const DEFAULT_SITE_NAME = 'Portfolio Fotografico';
const DEFAULT_TITLE = `${BRAND_NAME} | ${DEFAULT_SITE_NAME}`;
const DEFAULT_DESCRIPTION = 'Portfolio fotografico di Kevin Muka: serie, archivio completo e mappa interattiva con scatti di viaggio, paesaggi e città.';
const DEFAULT_OG_IMAGE = '/logo512.png';

function getSiteUrl() {
  if (process.env.REACT_APP_SITE_URL) {
    return process.env.REACT_APP_SITE_URL.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

function upsertMeta({ name, property, content }) {
  if (!content) return;

  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let meta = document.head.querySelector(selector);

  if (!meta) {
    meta = document.createElement('meta');
    if (name) meta.setAttribute('name', name);
    if (property) meta.setAttribute('property', property);
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', content);
}

function upsertCanonical(url) {
  if (!url) return;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', url);
}

export default function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  ogType = 'website',
  noindex = false,
  image = DEFAULT_OG_IMAGE,
} = {}) {
  const location = useLocation();

  useEffect(() => {
    const siteUrl = getSiteUrl();
    const pathname = location.pathname || '/';
    const absoluteUrl = siteUrl ? `${siteUrl}${pathname}` : pathname;
    const absoluteImage = image && image.startsWith('http')
      ? image
      : `${siteUrl}${image}`;

    const normalizedTitle = title ? `${BRAND_NAME} | ${title}` : DEFAULT_TITLE;
    document.title = normalizedTitle;

    upsertCanonical(absoluteUrl);
    upsertMeta({ name: 'description', content: description });
    upsertMeta({ name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' });

    upsertMeta({ property: 'og:title', content: normalizedTitle });
    upsertMeta({ property: 'og:description', content: description });
    upsertMeta({ property: 'og:type', content: ogType });
    upsertMeta({ property: 'og:url', content: absoluteUrl });
    upsertMeta({ property: 'og:site_name', content: BRAND_NAME });
    upsertMeta({ property: 'og:image', content: absoluteImage });

    upsertMeta({ name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta({ name: 'twitter:title', content: normalizedTitle });
    upsertMeta({ name: 'twitter:description', content: description });
    upsertMeta({ name: 'twitter:image', content: absoluteImage });
  }, [description, image, location.pathname, noindex, ogType, title]);
}
