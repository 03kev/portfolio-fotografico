import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import styled from 'styled-components';

const Backdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(4, 6, 12, 0.74);
  backdrop-filter: blur(6px);
`;

const Card = styled(motion.div)`
  width: min(460px, 100%);
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(12, 17, 28, 0.96), rgba(8, 12, 22, 0.98));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
`;

const Title = styled.h3`
  margin: 0 0 8px;
  color: var(--color-text);
  font-size: 1.12rem;
  font-weight: var(--font-weight-semibold);
`;

const Message = styled.div`
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--border-radius-lg);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: var(--transition-normal);

  &:hover:enabled {
    border-color: rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.08);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
`;

const ConfirmButton = styled(Button)`
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(214, 56, 56, 0.92);

  &:hover:enabled {
    border-color: rgba(255, 255, 255, 0.28);
    background: rgba(194, 39, 39, 0.96);
  }
`;

const Spinner = styled(Loader2)`
  animation: admin-confirm-spin 0.9s linear infinite;

  @keyframes admin-confirm-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const AdminConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel = 'Elimina',
  pendingLabel = 'Eliminazione...',
  pending = false,
  onCancel,
  onConfirm
}) => (
  <AnimatePresence>
    {open && (
      <Backdrop
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          if (!pending) onCancel();
        }}
      >
        <Card
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="admin-confirm-dialog-title"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(event) => event.stopPropagation()}
        >
          <Title id="admin-confirm-dialog-title">{title}</Title>
          <Message>{children}</Message>
          <Actions>
            <Button type="button" onClick={onCancel} disabled={pending} autoFocus>
              Annulla
            </Button>
            <ConfirmButton type="button" onClick={onConfirm} disabled={pending}>
              {pending ? (
                <>
                  <Spinner size={16} />
                  {pendingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </ConfirmButton>
          </Actions>
        </Card>
      </Backdrop>
    )}
  </AnimatePresence>
);

export default AdminConfirmDialog;
