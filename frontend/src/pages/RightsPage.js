import React from 'react';
import styled from 'styled-components';
import Section from '../ui/Section';
import useSeo from '../seo/useSeo';

const Wrap = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const Card = styled.div`
  display: grid;
  gap: 16px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--border-radius-2xl);
  background: rgba(255, 255, 255, 0.02);
  color: var(--color-muted);
  line-height: 1.65;

  p { margin: 0; }
  strong { color: var(--color-text); }
  a { color: var(--color-text); font-weight: var(--font-weight-semibold); }
`;

export default function RightsPage() {
  useSeo({
    title: 'Diritti d’autore e licenze',
    description: 'Informazioni su copyright, attribuzione e richieste di licenza per le fotografie di Kevin Muka.'
  });

  return (
    <Section
      title="Diritti d’autore e licenze"
      subtitle="Tutte le fotografie presenti in questo portfolio sono protette da copyright."
      headingLevel="h1"
    >
      <Wrap>
        <Card>
          <p><strong>© Kevin Muka. Tutti i diritti riservati.</strong></p>
          <p>
            Le fotografie non possono essere riprodotte, distribuite, modificate, pubblicate o utilizzate,
            anche parzialmente, senza un’autorizzazione preventiva scritta dell’autore.
          </p>
          <p>
            Per utilizzi editoriali, commerciali, collaborazioni o richieste di licenza, contatta
            {' '}<a href="/contact">Kevin Muka</a>.
          </p>
        </Card>
      </Wrap>
    </Section>
  );
}
