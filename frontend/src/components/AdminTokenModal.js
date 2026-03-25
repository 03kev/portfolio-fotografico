import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Loader2, X } from 'lucide-react';

const Backdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(4, 6, 12, 0.74);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Card = styled(motion.div)`
  width: min(460px, 100%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(12, 17, 28, 0.96), rgba(8, 12, 22, 0.98));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  padding: 22px;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
`;

const TitleWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const Title = styled.h3`
  margin: 0;
  color: var(--color-text);
  font-size: 1.1rem;
  font-weight: var(--font-weight-semibold);
`;

const Description = styled.p`
  margin: 10px 0 0 0;
  color: var(--color-muted);
  line-height: 1.5;
  font-size: var(--font-size-sm);
`;

const CloseButton = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
    border-color: rgba(255, 255, 255, 0.24);
  }
`;

const Form = styled.form`
  margin-top: 18px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  font-size: var(--font-size-sm);

  &:focus {
    outline: none;
    border-color: rgba(214, 179, 106, 0.55);
    box-shadow: 0 0 0 3px rgba(214, 179, 106, 0.1);
  }
`;

const ErrorMessage = styled.p`
  margin: 10px 0 0 0;
  color: #fca5a5;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
`;

const Actions = styled.div`
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Button = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--border-radius-lg);
  padding: 9px 14px;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: var(--transition-normal);
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.04);

  &:hover:enabled {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.24);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
`;

const SubmitButton = styled(Button)`
  background: rgba(214, 179, 106, 0.92);
  color: #111319;
  border-color: rgba(255, 255, 255, 0.22);

  &:hover:enabled {
    background: rgba(202, 168, 96, 0.95);
  }
`;

const Spinner = styled(Loader2)`
  animation: admin-token-spin 0.9s linear infinite;

  @keyframes admin-token-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

function AdminTokenModal({
  isOpen,
  loading = false,
  error = '',
  onClose,
  onSubmit
}) {
  const [token, setToken] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setToken('');
      return;
    }
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (loading) return;
      onClose?.();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, loading, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = token.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Backdrop
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (loading) return;
            onClose?.();
          }}
        >
          <Card
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Header>
              <TitleWrap>
                <KeyRound size={18} />
                <Title>Token Admin</Title>
              </TitleWrap>
              <CloseButton
                type="button"
                onClick={onClose}
                disabled={loading}
                aria-label="Chiudi"
              >
                <X size={16} />
              </CloseButton>
            </Header>

            <Description>
              Inserisci il token admin per aprire la sessione in scrittura.
            </Description>

            <Form onSubmit={handleSubmit}>
              <Label htmlFor="admin-token-input">Password token</Label>
              <Input
                ref={inputRef}
                id="admin-token-input"
                type="password"
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Inserisci token"
                disabled={loading}
              />
              {error ? <ErrorMessage>{error}</ErrorMessage> : null}

              <Actions>
                <Button type="button" onClick={onClose} disabled={loading}>
                  Annulla
                </Button>
                <SubmitButton type="submit" disabled={loading || !token.trim()}>
                  {loading ? (
                    <>
                      <Spinner size={16} />
                      Verifica...
                    </>
                  ) : (
                    'Conferma'
                  )}
                </SubmitButton>
              </Actions>
            </Form>
          </Card>
        </Backdrop>
      )}
    </AnimatePresence>
  );
}

export default AdminTokenModal;
