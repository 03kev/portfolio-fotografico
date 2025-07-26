// Utilità generali per l'applicazione

export const formatDate = (dateString, locale = 'it-IT') => {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatDateTime = (dateString, locale = 'it-IT') => {
  return new Date(dateString).toLocaleString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const truncateText = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const getImageDimensions = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.src = URL.createObjectURL(file);
  });
};

export const convertBytesToHumanReadable = (bytes) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
};

export const getLocationFromCoords = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=it`
    );
    const data = await response.json();
    return {
      city: data.city || data.locality,
      country: data.countryName,
      full: data.city 
        ? `${data.city}, ${data.countryName}` 
        : `${data.locality}, ${data.countryName}`
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
};

export const extractExifData = (file) => {
  return new Promise((resolve) => {
    // Placeholder per estrazione dati EXIF
    // In un'implementazione reale useresti una libreria come exif-js
    resolve({
      camera: 'Camera Info',
      lens: 'Lens Info',
      settings: {
        aperture: 'f/2.8',
        shutter: '1/125s',
        iso: '200',
        focal: '35mm'
      },
      dateTime: new Date().toISOString()
    });
  });
};

export const smoothScrollTo = (element, duration = 800) => {
  const targetPosition = element.offsetTop;
  const startPosition = window.pageYOffset;
  const distance = targetPosition - startPosition;
  let startTime = null;

  const animation = (currentTime) => {
    if (startTime === null) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const run = ease(timeElapsed, startPosition, distance, duration);
    window.scrollTo(0, run);
    if (timeElapsed < duration) requestAnimationFrame(animation);
  };

  const ease = (t, b, c, d) => {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t + b;
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
  };

  requestAnimationFrame(animation);
};

export const getColorFromImage = async (imageSrc) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let r = 0, g = 0, b = 0;
      const pixelCount = data.length / 4;
      
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      
      r = Math.round(r / pixelCount);
      g = Math.round(g / pixelCount);
      b = Math.round(b / pixelCount);
      
      resolve(`rgb(${r}, ${g}, ${b})`);
    };
    
    img.onerror = () => resolve('#667eea');
    img.src = imageSrc;
  });
};

export const createShareableLink = (photo) => {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    photo: photo.id,
    title: photo.title,
    location: photo.location
  });
  return `${baseUrl}?${params.toString()}`;
};

export const downloadImage = async (imageUrl, filename) => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading image:', error);
  }
};

export const getContrastColor = (hexColor) => {
  // Rimuovi il simbolo # se presente
  const color = hexColor.replace('#', '');
  
  // Converti in RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);
  
  // Calcola la luminanza
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

export const animateValue = (start, end, duration, callback) => {
  const startTime = performance.now();
  
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const value = start + (end - start) * progress;
    callback(Math.round(value));
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};

export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

export const isWebPSupported = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('webp') > -1;
};

export const lazyLoadImage = (img, src) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        img.src = src;
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  });
  
  observer.observe(img);
};

export default {
  formatDate,
  formatDateTime,
  truncateText,
  debounce,
  throttle,
  generateId,
  validateEmail,
  validateUrl,
  getImageDimensions,
  convertBytesToHumanReadable,
  getLocationFromCoords,
  extractExifData,
  smoothScrollTo,
  getColorFromImage,
  createShareableLink,
  downloadImage,
  getContrastColor,
  animateValue,
  isMobileDevice,
  isWebPSupported,
  lazyLoadImage
};
