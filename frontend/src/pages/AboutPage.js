import React from 'react';
import styled from 'styled-components';
import Section from '../ui/Section';

const Wrap = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const Card = styled.div`
  border-radius: var(--border-radius-2xl);
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.02);
  padding: 28px;
`;

const P = styled.p`
  margin: 0 0 14px;
  line-height: 1.75;
`;

export default function AboutPage() {
  return (
    <Section
      title="Chi sono"
      subtitle="Due righe su di me e su come lavoro. (Testo placeholder: personalizzalo)"
    >
      <Wrap>
        <Card>
          <P>
            Mi chiamo <strong>[Il tuo nome]</strong> e fotografo <strong>[cosa]</strong> tra <strong>[luoghi]</strong>.
            Mi interessa raccontare storie semplici e coerenti: una luce, una strada, una stagione.
          </P>
          <P>
            In questo portfolio trovi serie tematiche e una galleria completa. Se ti va, parti dalla mappa per esplorare gli scatti per posizione.
          </P>
          <P style={{ marginBottom: 0 }}>
            Disponibile per <strong>[stampe / commissioni / progetti]</strong>. Scrivimi dalla pagina Contatti.
          </P>
        </Card>
      </Wrap>
    </Section>
  );
}
