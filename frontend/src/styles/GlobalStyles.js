import { createGlobalStyle } from 'styled-components';

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

  html {
    scroll-behavior: smooth;
    scrollbar-gutter: stable;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
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

  main {
    padding-top: var(--header-height);
    min-height: calc(100vh - var(--header-height));
  }

  @media (max-width: 768px) {
    :root {
      --header-height: 70px;
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
