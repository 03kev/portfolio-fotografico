import React from 'react';
import styled from 'styled-components';
import Section from '../ui/Section';
import useSeo from '../seo/useSeo';

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

const Quote = styled.blockquote`
  margin: 24px 0;
  padding: 18px 20px;
  border-left: 2px solid rgba(213, 180, 104, 0.75);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.88);
  font-size: 1.02rem;
  line-height: 1.7;
  font-style: italic;
`;

const QuoteAuthor = styled.cite`
  display: block;
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 0.9rem;
  font-style: normal;
`;

export default function AboutPage() {
  useSeo({
    title: 'Chi Sono',
    description: 'Biografia breve di Kevin Muka, approccio fotografico e visione narrativa del portfolio.',
  });

  return (
    <Section
      title="Chi sono"
      subtitle="Due righe su di me e su come lavoro."
      headingLevel="h1"
    >
      <Wrap>
        <Card>
          <P>
            Mi chiamo <strong>Kevin</strong> e fotografo <strong>momenti</strong> in <strong>luoghi significativi</strong>.
            Mi interessa raccontare storie semplici e coerenti: una luce, una strada, una stagione.
          </P>
          <P>
            In questo portfolio trovi serie tematiche e un'archivio completo. Se ti va, parti dalla mappa per esplorare gli scatti per posizione.
          </P>
          <Quote>
            The camera is an instrument that teaches people how to see without a camera.
            <QuoteAuthor>Dorothea Lange</QuoteAuthor>
          </Quote>
          <Quote>
            The Earth is art, the photographer is only a witness.
            <QuoteAuthor>Yann Arthus-Bertrand</QuoteAuthor>
          </Quote>
        </Card>
      </Wrap>
    </Section>
  );
}
