import { createGlobalStyle } from 'styled-components';
import { viewportBreakpoints, viewportHeights } from './responsive';

/**
 * Design refresh (più "professionale")
 * - Palette più neutra e coerente
 * - Un solo accento cromatico
 * - Tipografia e spaziature più sobrie
 * - Motion ridotto e più elegante
 */
const GlobalStyles = createGlobalStyle`
  :root {
    /* Base palette */
    --color-bg: #0b0b0d;
    --color-bg-elev: #101115;
    --color-surface: rgba(255, 255, 255, 0.04);
    --color-surface-2: rgba(255, 255, 255, 0.06);
    --color-border: rgba(255, 255, 255, 0.10);

    --color-text: rgba(255, 255, 255, 0.92);
    --color-muted: rgba(255, 255, 255, 0.70);
    --color-faint: rgba(255, 255, 255, 0.55);

    /* Accent (warm "film") */
    --color-accent: #d6b36a;
    --color-accent-2: rgba(214, 179, 106, 0.22);

    /* Semantic */
    --color-success: #34d399;
    --color-warning: #fbbf24;
    --color-error: #fb7185;

    /* Legacy vars (kept for components) */
    --color-primary: var(--color-accent);
    --color-secondary: rgba(255, 255, 255, 0.78);
    --color-dark: var(--color-bg);
    --color-dark-light: var(--color-bg-elev);
    --color-dark-lighter: #171824;
    --color-gray: rgba(255, 255, 255, 0.35);
    --color-gray-light: rgba(255, 255, 255, 0.45);
    --color-light: #f9fafb;
    --color-white: #ffffff;

    /* Gradients (muted) */
    --primary-gradient: linear-gradient(135deg, rgba(214, 179, 106, 0.95) 0%, rgba(214, 179, 106, 0.65) 100%);
    --secondary-gradient: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.55) 100%);
    --accent-gradient: var(--primary-gradient);
    --dark-gradient: radial-gradient(1200px 700px at 50% -10%, rgba(214, 179, 106, 0.10) 0%, rgba(11, 11, 13, 0) 55%), var(--color-bg);
    --home-surface-bg: radial-gradient(900px 520px at 20% 12%, rgba(214, 179, 106, 0.16) 0%, rgba(214, 179, 106, 0) 60%),
      radial-gradient(900px 520px at 80% 18%, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 62%),
      var(--dark-gradient);

    /* Shadows (softer, less "neon") */
    --shadow-small: 0 1px 2px rgba(0, 0, 0, 0.35);
    --shadow-medium: 0 8px 18px rgba(0, 0, 0, 0.35);
    --shadow-large: 0 16px 40px rgba(0, 0, 0, 0.45);
    --shadow-2xl: 0 30px 70px rgba(0, 0, 0, 0.55);

    /* Radius */
    --border-radius-sm: 0.375rem;
    --border-radius: 0.5rem;
    --border-radius-lg: 0.75rem;
    --border-radius-xl: 1rem;
    --border-radius-2xl: 1.25rem;
    --border-radius-full: 9999px;

    /* Spacing */
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
    --spacing-2xl: 3rem;
    --spacing-3xl: 4rem;
    --spacing-4xl: 5rem;

    /* Layout /*/
    --header-height: 78px;
    --mobile-bottom-nav-height: 0px;

    /* Typography */
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;
    --font-size-base: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.25rem;
    --font-size-2xl: 1.5rem;
    --font-size-3xl: 1.875rem;
    --font-size-4xl: 2.25rem;
    --font-size-5xl: 3rem;
    --font-size-6xl: 3.75rem;

    --font-weight-light: 300;
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    --font-weight-extrabold: 800;
    --font-weight-black: 900;

    /* Motion */
    --transition-fast: 0.12s ease;
    --transition-normal: 0.22s ease;
    --transition-slow: 0.35s ease;

    /* Z */
    --z-dropdown: 1000;
    --z-sticky: 1020;
    --z-fixed: 1030;
    --z-modal-backdrop: 1040;
    --z-modal: 1050;
    --z-popover: 1060;
    --z-tooltip: 1070;

    /* Shared panel/card tokens */
    --panel-overlay-pad-inline: 24px;
    --panel-backdrop-bg: rgba(4, 6, 12, 0.74);
    --panel-backdrop-blur: 8px;
    --panel-radius: 20px;
    --panel-border-color: rgba(255, 255, 255, 0.12);
    --panel-bg: linear-gradient(180deg, rgba(12, 17, 28, 0.96), rgba(8, 12, 22, 0.98));
    --panel-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
    --panel-padding: 22px;
    --panel-gap: 16px;
    --panel-inset-radius: 15px;
    --panel-inset-border-color: rgba(255, 255, 255, 0.08);
    --panel-inset-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
    --panel-inset-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    --panel-inset-padding: 12px 14px;
    --panel-close-size: 36px;
    --panel-close-radius: 999px;

    /* Shared responsive shell tokens */
    --shell-overlay-pad-inline: 24px;
    --shell-overlay-pad-top: min(8vh, 72px);
    --shell-overlay-pad-bottom: var(--shell-overlay-pad-inline);
    --shell-height-buffer: 18px;
    --shell-available-height: calc(100dvh - var(--shell-overlay-pad-top) - var(--shell-overlay-pad-bottom));
    --shell-bounded-height: min(var(--shell-height-cap), calc(var(--shell-available-height) - var(--shell-height-buffer)));
    --shell-width: min(100%, 980px);
    --shell-height-cap: 980px;
    --shell-max-height: var(--shell-bounded-height);
    --shell-radius: 30px;
    --shell-glow-height: 120px;
    --shell-header-gap: 18px;
    --shell-header-pad: 28px 30px 18px;
    --shell-title-size: clamp(1.5rem, 2vw, 1.95rem);
    --shell-subtitle-size: 0.96rem;
    --shell-subtitle-line-height: 1.55;
    --shell-close-size: 48px;
    --shell-step-top: 112px;
    --shell-step-gap: 12px;
    --shell-step-pad: 14px 30px 16px;
    --shell-step-button-pad: 14px 16px;
    --shell-step-button-radius: 18px;
    --shell-step-index-size: 28px;
    --shell-step-index-font-size: 0.82rem;
    --shell-step-text-size: 0.95rem;
    --shell-content-pad: 28px 30px 30px;
    --shell-content-max-width: 780px;
    --shell-section-pad: 22px;
    --shell-section-radius: 22px;
    --shell-field-gap: 16px;
    --shell-field-pad: 14px 16px;
    --shell-upload-stage-max-inline-size: 440px;
    --shell-upload-stage-pad: 42px 24px;
    --shell-upload-stage-radius: 26px;
    --shell-preview-radius: 24px;
    --shell-footer-gap: 18px;
    --shell-footer-pad: 18px 30px calc(18px + env(safe-area-inset-bottom));
    --shell-action-min-height: 52px;

    /* Shared scrollbar tokens */
    --scrollbar-size: 10px;
    --scrollbar-radius: 999px;
    --scrollbar-track: rgba(255, 255, 255, 0.04);
    --scrollbar-track-border: rgba(255, 255, 255, 0.02);
    --scrollbar-thumb: linear-gradient(180deg, rgba(214, 181, 102, 0.48) 0%, rgba(176, 144, 77, 0.5) 100%);
    --scrollbar-thumb-hover: linear-gradient(180deg, rgba(224, 191, 111, 0.68) 0%, rgba(190, 156, 82, 0.72) 100%);
    --scrollbar-thumb-ring: rgba(214, 181, 102, 0.08);
  }

  /* Reset */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* I controlli non devono attivare il riquadro di tap/selezione del browser
     su touch. Il testo dei contenuti e i campi di input restano selezionabili. */
  button,
  a,
  [role='button'],
  summary {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  html {
    scroll-behavior: smooth;
    scrollbar-gutter: stable;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
    scrollbar-width: thin;
    scrollbar-color: rgba(214, 181, 102, 0.42) rgba(255, 255, 255, 0.05);
  }

  body {

    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: var(--dark-gradient);
    color: var(--color-text);
    line-height: 1.65;
    overflow-x: hidden;
    overflow-y: scroll;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(214, 181, 102, 0.42) rgba(255, 255, 255, 0.05);
  }

  *::-webkit-scrollbar {
    width: var(--scrollbar-size);
    height: var(--scrollbar-size);
  }

  *::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: var(--scrollbar-radius);
    border: 2px solid transparent;
    background-clip: padding-box;
    box-shadow: inset 0 0 0 1px var(--scrollbar-track-border);
  }

  *::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--scrollbar-radius);
    border: 2px solid transparent;
    background-clip: padding-box;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 0 0 1px var(--scrollbar-thumb-ring);
  }

  *::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  html.home-surface {
    background: var(--color-bg);
  }

  body.home-surface {
    background: var(--color-bg);
  }

  main {
    padding-top: var(--header-height);
    padding-bottom: var(--mobile-bottom-nav-height);
    min-height: calc(100vh - var(--header-height));
  }

  @media (min-width: ${viewportBreakpoints.laptop}px) {
    :root {
      --panel-padding: 20px;
      --shell-width: min(100%, 920px);
      --shell-height-cap: 980px;
      --shell-height-buffer: 18px;
      --shell-max-height: var(--shell-bounded-height);
      --shell-glow-height: 96px;
      --shell-header-gap: 16px;
      --shell-header-pad: 22px 24px 14px;
      --shell-title-size: clamp(1.45rem, 1.8vw, 1.8rem);
      --shell-subtitle-size: 0.92rem;
      --shell-subtitle-line-height: 1.45;
      --shell-step-top: 96px;
      --shell-step-gap: 10px;
      --shell-step-pad: 12px 24px 14px;
      --shell-step-button-pad: 12px 14px;
      --shell-step-button-radius: 16px;
      --shell-content-pad: 22px 24px 24px;
      --shell-content-max-width: 700px;
      --shell-section-pad: 18px;
      --shell-section-radius: 18px;
      --shell-upload-stage-pad: 34px 22px;
      --shell-footer-pad: 14px 24px calc(14px + env(safe-area-inset-bottom));
      --shell-action-min-height: 48px;
    }
  }

  @media (max-height: ${viewportHeights.compact}px) {
    :root {
      --panel-padding: 18px;
      --shell-overlay-pad-top: 12px;
      --shell-overlay-pad-bottom: 12px;
      --shell-height-buffer: 14px;
      --shell-max-height: var(--shell-bounded-height);
      --shell-radius: 24px;
      --shell-glow-height: 84px;
      --shell-header-gap: 14px;
      --shell-header-pad: 18px 22px 14px;
      --shell-title-size: clamp(1.34rem, 1.7vw, 1.6rem);
      --shell-subtitle-size: 0.9rem;
      --shell-subtitle-line-height: 1.45;
      --shell-close-size: 42px;
      --shell-step-top: 88px;
      --shell-step-gap: 10px;
      --shell-step-pad: 12px 22px 14px;
      --shell-step-button-pad: 11px 13px;
      --shell-step-button-radius: 16px;
      --shell-step-index-size: 25px;
      --shell-step-index-font-size: 0.78rem;
      --shell-step-text-size: 0.91rem;
      --shell-content-pad: 18px 22px 20px;
      --shell-section-pad: 18px;
      --shell-section-radius: 18px;
      --shell-field-gap: 12px;
      --shell-field-pad: 12px 14px;
      --shell-footer-gap: 14px;
      --shell-action-min-height: 46px;
    }
  }

  @media (max-height: ${viewportHeights.short}px) {
    :root {
      --panel-padding: 16px;
      --shell-overlay-pad-top: 8px;
      --shell-overlay-pad-bottom: 8px;
      --shell-height-buffer: 10px;
      --shell-max-height: var(--shell-bounded-height);
      --shell-radius: 20px;
      --shell-glow-height: 64px;
      --shell-header-gap: 10px;
      --shell-header-pad: 14px 18px 10px;
      --shell-title-size: clamp(1.2rem, 1.45vw, 1.42rem);
      --shell-subtitle-size: 0.84rem;
      --shell-subtitle-line-height: 1.35;
      --shell-close-size: 38px;
      --shell-step-top: 72px;
      --shell-step-gap: 8px;
      --shell-step-pad: 10px 18px 10px;
      --shell-step-button-pad: 10px 12px;
      --shell-step-button-radius: 14px;
      --shell-step-index-size: 22px;
      --shell-step-index-font-size: 0.74rem;
      --shell-step-text-size: 0.84rem;
      --shell-content-pad: 14px 18px 16px;
    }
  }

  @media (max-width: ${viewportBreakpoints.tablet}px) {
    :root {
      --panel-overlay-pad-inline: 12px;
      --panel-padding: 16px;
      --shell-overlay-pad-inline: 10px;
      --shell-overlay-pad-top: max(10px, env(safe-area-inset-top));
      --shell-overlay-pad-bottom: max(10px, env(safe-area-inset-bottom));
      --shell-height-buffer: 10px;
      --shell-radius: 24px;
      --shell-header-gap: 14px;
      --shell-header-pad: 18px 18px 14px;
      --shell-title-size: 1.34rem;
      --shell-subtitle-size: 0.88rem;
      --shell-close-size: 42px;
      --shell-step-top: 98px;
      --shell-step-gap: 8px;
      --shell-step-pad: 12px 16px 14px;
      --shell-step-button-pad: 11px 10px;
      --shell-step-button-radius: 15px;
      --shell-step-index-size: 24px;
      --shell-step-index-font-size: 0.75rem;
      --shell-step-text-size: 0.83rem;
      --shell-content-pad: 18px 16px 18px;
      --shell-content-max-width: 100%;
      --shell-upload-stage-pad: 28px 20px;
      --shell-upload-stage-radius: 22px;
      --shell-preview-radius: 20px;
    }
  }

  @media (max-width: ${viewportBreakpoints.tablet}px) and (hover: none) and (pointer: coarse) {
    :root {
      --header-height: 70px;
      --mobile-bottom-nav-height: 92px;
    }
  }


  /* Improve anchor scrolling with fixed header */
  section[id] {
    scroll-margin-top: 90px;
  }

  /* Typography */
  h1, h2, h3, h4, h5, h6 {
    font-weight: var(--font-weight-bold);
    line-height: 1.15;
    letter-spacing: -0.02em;
  }

  p {
    color: var(--color-muted);
    margin-bottom: var(--spacing-md);
  }

  a {
    color: var(--color-text);
    text-decoration: none;
    transition: opacity var(--transition-normal), color var(--transition-normal);
  }

  a:hover {
    color: var(--color-accent);
  }

  button {
    cursor: pointer;
    border: none;
    background: none;
    font-family: inherit;
    transition: transform var(--transition-normal), opacity var(--transition-normal), box-shadow var(--transition-normal);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  input, textarea, select {
    font-family: inherit;
    font-size: inherit;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: var(--border-radius);
    padding: var(--spacing-sm) var(--spacing-md);
    transition: border-color var(--transition-normal), background var(--transition-normal), box-shadow var(--transition-normal);
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: rgba(214, 179, 106, 0.55);
    background: var(--color-surface-2);
    box-shadow: 0 0 0 3px rgba(214, 179, 106, 0.10);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--color-faint);
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
  }

  ul, ol {
    list-style: none;
  }

  ::selection {
    background: rgba(214, 179, 106, 0.25);
  }

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: var(--border-radius-full);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.28);
  }

  /* Utility */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--spacing-lg);
  }

  .container-fluid {
    max-width: 100%;
    padding: 0 var(--spacing-lg);
  }

  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }

  .gradient-text {
    background: var(--secondary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Subtle animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animate-fadeIn { animation: fadeIn 0.35s ease forwards; }
  .animate-fadeInUp { animation: fadeInUp 0.45s ease forwards; }
  .animate-spin { animation: spin 1s linear infinite; }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

export default GlobalStyles;
