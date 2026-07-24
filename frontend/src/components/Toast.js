import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { viewportBreakpoints } from '../styles/responsive';

const ToastContainer = styled.div`
  position: fixed;
  top: calc(var(--header-height) + 12px);
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;

  @media (max-width: ${viewportBreakpoints.medium}px) {
    top: calc(var(--header-height) + 8px);
    right: 10px;
    left: 10px;
  }
`;

const ToastItem = styled(motion.div)`
  background: ${props => {
    switch (props.type) {
      case 'success': return 'linear-gradient(135deg, #4CAF50, #45a049)';
      case 'error': return 'linear-gradient(135deg, #f44336, #d32f2f)';
      case 'warning': return 'linear-gradient(135deg, #ff9800, #f57c00)';
      case 'info': 
      default: return 'linear-gradient(135deg, #2196F3, #1976d2)';
    }
  }};
  color: white;
  padding: 15px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 400px;
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.4;

  @media (max-width: ${viewportBreakpoints.medium}px) {
    padding: 12px 16px;
    font-size: 13px;
    max-width: none;
  }
`;

const ToastIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ToastMessage = styled.div`
  flex: 1;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 0;
  margin-left: 10px;
  font-size: 16px;
  line-height: 1;
  transition: color 0.2s;
  flex-shrink: 0;

  &:hover {
    color: white;
  }
`;

// Hook per gestire le notifiche
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };
    
    setToasts(prev => [...prev, toast]);

    // Auto-remove dopo la durata specificata
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const clearAll = () => {
    setToasts([]);
  };

  // Metodi di convenienza
  const success = (message, duration) => addToast(message, 'success', duration);
  const error = (message, duration) => addToast(message, 'error', duration);
  const warning = (message, duration) => addToast(message, 'warning', duration);
  const info = (message, duration) => addToast(message, 'info', duration);

  return {
    toasts,
    addToast,
    removeToast,
    clearAll,
    success,
    error,
    warning,
    info
  };
};

// Componente Toast
const Toast = ({ toast, onClose }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={18} />;
      case 'error': return <XCircle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      case 'info':
      default: return <Info size={18} />;
    }
  };

  return (
    <ToastItem
      layout
      type={toast.type}
      initial={{ opacity: 0, x: 300, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 220, scale: 0.9 }}
      transition={{
        layout: { duration: 0.18, ease: 'easeOut' },
        opacity: { duration: 0.18, ease: 'easeOut' },
        x: { duration: 0.18, ease: 'easeOut' },
        scale: { duration: 0.18, ease: 'easeOut' }
      }}
      onClick={() => onClose(toast.id)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <ToastIcon>{getIcon(toast.type)}</ToastIcon>
      <ToastMessage>{toast.message}</ToastMessage>
      <CloseButton onClick={(e) => {
        e.stopPropagation();
        onClose(toast.id);
      }}>
        ×
      </CloseButton>
    </ToastItem>
  );
};

// Componente Container principale
const ToastProvider = ({ toasts, onRemove }) => {
  return (
    <ToastContainer>
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={onRemove}
          />
        ))}
      </AnimatePresence>
    </ToastContainer>
  );
};

export default ToastProvider;

// Esempio di utilizzo:
/*
const MyComponent = () => {
  const toast = useToast();

  const handleSuccess = () => {
    toast.success('Foto caricata con successo!');
  };

  const handleError = () => {
    toast.error('Errore durante il caricamento');
  };

  return (
    <div>
      <button onClick={handleSuccess}>Successo</button>
      <button onClick={handleError}>Errore</button>
      <ToastProvider toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
};
*/
