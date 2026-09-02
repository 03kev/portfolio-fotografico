import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
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

export const TOAST_DURATIONS = Object.freeze({
  success: 3600,
  error: 6000,
  warning: 6500,
  info: 3600
});

const ToastContext = createContext(null);

const useToastController = () => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration) => {
    const id = Date.now() + Math.random();
    const resolvedDuration = duration ?? TOAST_DURATIONS[type] ?? TOAST_DURATIONS.info;
    const toast = { id, message, type, duration: resolvedDuration };
    
    setToasts(prev => [...prev, toast]);

    if (resolvedDuration > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        removeToast(id);
      }, resolvedDuration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [removeToast]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
  }, []);

  const success = useCallback(
    (message, duration) => addToast(message, 'success', duration),
    [addToast]
  );
  const error = useCallback(
    (message, duration) => addToast(message, 'error', duration),
    [addToast]
  );
  const warning = useCallback(
    (message, duration) => addToast(message, 'warning', duration),
    [addToast]
  );
  const info = useCallback(
    (message, duration) => addToast(message, 'info', duration),
    [addToast]
  );

  return useMemo(() => ({
    toasts,
    addToast,
    removeToast,
    clearAll,
    success,
    error,
    warning,
    info
  }), [addToast, clearAll, error, info, removeToast, success, toasts, warning]);
};

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
      role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
      aria-atomic="true"
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
      }} aria-label="Chiudi notifica">
        ×
      </CloseButton>
    </ToastItem>
  );
};

const ToastViewport = ({ toasts, onRemove }) => {
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

const ToastProvider = ({ children }) => {
  const controller = useToastController();
  return (
    <ToastContext.Provider value={controller}>
      {children}
      <ToastViewport toasts={controller.toasts} onRemove={controller.removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve essere usato all’interno di ToastProvider');
  }
  return context;
};

export default ToastProvider;
