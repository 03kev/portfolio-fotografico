import { createGlobalStyle } from 'styled-components';

const GlobalStyles = createGlobalStyle`
  /* Reset e variabili CSS */
  :root {
    --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    --accent-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    --dark-gradient: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 50%, #2d2d2d 100%);
    
    --color-primary: #667eea;
    --color-secondary: #f5576c;
    --color-accent: #4facfe;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;
    
    --color-dark: #0c0c0c;
    --color-dark-light: #1a1a1a;
    --color-dark-lighter: #2d2d2d;
    --color-gray: #4b5563;
    --color-gray-light: #6b7280;
    --color-light: #f9fafb;
    --color-white: #ffffff;
    
    --shadow-small: 0 2px 4px rgba(0, 0, 0, 0.1);
    --shadow-medium: 0 4px 6px rgba(0, 0, 0, 0.1);
    --shadow-large: 0 10px 15px rgba(0, 0, 0, 0.1);
    --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1);
    --shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25);
    
    --border-radius-sm: 0.375rem;
    --border-radius: 0.5rem;
    --border-radius-lg: 0.75rem;
    --border-radius-xl: 1rem;
    --border-radius-2xl: 1.5rem;
    --border-radius-full: 9999px;
    
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
    --spacing-2xl: 3rem;
    --spacing-3xl: 4rem;
    --spacing-4xl: 5rem;
    
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
    
    --transition-fast: 0.15s ease;
    --transition-normal: 0.3s ease;
    --transition-slow: 0.5s ease;
    
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

  /* Body e HTML */
  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: var(--dark-gradient);
    color: var(--color-white);
    line-height: 1.6;
    overflow-x: hidden;
  }

  /* Tipografia */
  h1, h2, h3, h4, h5, h6 {
    font-weight: var(--font-weight-bold);
    line-height: 1.2;
    margin-bottom: var(--spacing-md);
  }

  h1 {
    font-size: var(--font-size-5xl);
    font-weight: var(--font-weight-black);
  }

  h2 {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-extrabold);
  }

  h3 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
  }

  h4 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
  }

  h5 {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-medium);
  }

  h6 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
  }

  p {
    margin-bottom: var(--spacing-md);
  }

  /* Link */
  a {
    color: var(--color-accent);
    text-decoration: none;
    transition: var(--transition-normal);
  }

  a:hover {
    opacity: 0.8;
  }

  /* Bottoni */
  button {
    cursor: pointer;
    border: none;
    background: none;
    font-family: inherit;
    transition: var(--transition-normal);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Form elements */
  input, textarea, select {
    font-family: inherit;
    font-size: inherit;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-white);
    border-radius: var(--border-radius);
    padding: var(--spacing-sm) var(--spacing-md);
    transition: var(--transition-normal);
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(79, 172, 254, 0.1);
  }

  input::placeholder,
  textarea::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  /* Immagini */
  img {
    max-width: 100%;
    height: auto;
    display: block;
  }

  /* Lista */
  ul, ol {
    list-style: none;
  }

  /* Scrollbar personalizzata */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--color-dark-light);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--color-gray);
    border-radius: var(--border-radius-full);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--color-gray-light);
  }

  /* Utility Classes */
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 var(--spacing-lg);
  }

  .container-fluid {
    max-width: 100%;
    padding: 0 var(--spacing-lg);
  }

  .text-center {
    text-align: center;
  }

  .text-left {
    text-align: left;
  }

  .text-right {
    text-align: right;
  }

  .gradient-text {
    background: var(--primary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .gradient-text-secondary {
    background: var(--secondary-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .gradient-text-accent {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Animazioni */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes bounce {
    0%, 20%, 53%, 80%, 100% {
      transform: translate3d(0, 0, 0);
    }
    40%, 43% {
      transform: translate3d(0, -30px, 0);
    }
    70% {
      transform: translate3d(0, -15px, 0);
    }
    90% {
      transform: translate3d(0, -4px, 0);
    }
  }

  .animate-fadeIn {
    animation: fadeIn 0.5s ease forwards;
  }

  .animate-fadeInUp {
    animation: fadeInUp 0.6s ease forwards;
  }

  .animate-fadeInDown {
    animation: fadeInDown 0.6s ease forwards;
  }

  .animate-slideInLeft {
    animation: slideInLeft 0.6s ease forwards;
  }

  .animate-slideInRight {
    animation: slideInRight 0.6s ease forwards;
  }

  .animate-scaleIn {
    animation: scaleIn 0.4s ease forwards;
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .animate-bounce {
    animation: bounce 1s infinite;
  }

  /* Responsive breakpoints */
  @media (max-width: 1536px) {
    .container {
      max-width: 1280px;
    }
  }

  @media (max-width: 1280px) {
    .container {
      max-width: 1024px;
    }
  }

  @media (max-width: 1024px) {
    .container {
      max-width: 768px;
    }
  }

  @media (max-width: 768px) {
    .container {
      max-width: 640px;
      padding: 0 var(--spacing-md);
    }
    
    h1 {
      font-size: var(--font-size-4xl);
    }
    
    h2 {
      font-size: var(--font-size-3xl);
    }
    
    h3 {
      font-size: var(--font-size-2xl);
    }
  }

  @media (max-width: 640px) {
    .container {
      padding: 0 var(--spacing-sm);
    }
  }

  /* Focus styles per accessibilità */
  .focus-visible:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  /* Riduzione movimento per accessibilità */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    
    html {
      scroll-behavior: auto;
    }
  }
`;

export default GlobalStyles;
