import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getSiteUrl } from '../utils/siteUrl';

const BRAND_NAME = 'Kevin Muka';
const DEFAULT_SITE_NAME = 'Portfolio Fotografico';
const DEFAULT_TITLE = `${BRAND_NAME} | ${DEFAULT_SITE_NAME}`;
const DEFAULT_DESCRIPTION = 'Portfolio fotografico di Kevin Muka: serie, archivio completo e mappa interattiva con scatti di viaggio, paesaggi e città.';
const DEFAULT_OG_IMAGE = '';

function upsertMeta({ name, property, content }) {
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let meta = document.head.querySelector(selector);

  if (!content) {
    if (meta) {
      meta.remove();
    }
    return;
  }

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

function upsertRelMe(url) {
  if (!url) return;
  const selector = `link[rel="me"][href="${url}"]`;
  let relMe = document.head.querySelector(selector);
  if (!relMe) {
    relMe = document.createElement('link');
    relMe.setAttribute('rel', 'me');
    relMe.setAttribute('href', url);
    document.head.appendChild(relMe);
  }
}

function upsertStructuredData(structuredData) {
  const existing = Array.from(document.head.querySelectorAll('script[data-seo-ld="true"]'));
  existing.forEach((node) => node.remove());

  if (!structuredData) return;

  const payload = Array.isArray(structuredData) ? structuredData : [structuredData];
  payload
    .filter(Boolean)
    .forEach((item, index) => {
      const script = document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-seo-ld', 'true');
      script.setAttribute('data-seo-ld-index', String(index));
      script.textContent = JSON.stringify(item);
      document.head.appendChild(script);
    });
}

export default function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  ogType = 'website',
  noindex = false,
  image = DEFAULT_OG_IMAGE,
  structuredData = null,
  prependBrand = true,
  keywords = '',
} = {}) {
  const location = useLocation();

  useEffect(() => {
    const siteUrl = getSiteUrl();
    const pathname = location.pathname || '/';
    const search = location.search || '';
    const absoluteUrl = siteUrl ? `${siteUrl}${pathname}${search}` : `${pathname}${search}`;
    let absoluteImage = '';
    if (image) {
      absoluteImage = image.startsWith('http')
        ? image
        : `${siteUrl}${image}`;
    }

    const normalizedTitle = title
      ? (prependBrand ? `${BRAND_NAME} | ${title}` : title)
      : DEFAULT_TITLE;
    document.title = normalizedTitle;

    upsertCanonical(absoluteUrl);
    upsertRelMe('https://instagram.com/kev.muka');
    upsertMeta({ name: 'description', content: description });
    upsertMeta({ name: 'keywords', content: keywords });
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
    upsertStructuredData(structuredData);
  }, [description, image, keywords, location.pathname, location.search, noindex, ogType, prependBrand, structuredData, title]);
}
