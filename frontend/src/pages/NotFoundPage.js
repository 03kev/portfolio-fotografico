import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import Section from '../ui/Section';

const Center = styled.div`
  text-align: center;
`;

const Button = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border-radius: var(--border-radius-full);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);

  &:hover {
    border-color: rgba(214, 179, 106, 0.35);
    background: rgba(214, 179, 106, 0.08);
    transform: translateY(-1px);
  }
`;

export default function NotFoundPage() {
  return (
    <Section title="Pagina non trovata" subtitle="La risorsa richiesta non esiste.">
      <Center>
        <Button to="/">Torna alla home</Button>
      </Center>
    </Section>
  );
}
