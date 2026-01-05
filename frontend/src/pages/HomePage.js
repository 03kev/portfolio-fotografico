import React, { useEffect } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

import Hero from '../components/Hero';
import Section from '../ui/Section';
import FeaturedSeries from '../components/FeaturedSeries';
import FeaturedGallery from '../components/FeaturedGallery';

const HomeSurface = styled.div`
  position: relative;
  min-height: 100vh;
  background: var(--color-bg);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(900px 520px at 20% 12%, rgba(214, 179, 106, 0.16) 0%, rgba(214, 179, 106, 0) 60%),
      radial-gradient(900px 520px at 80% 18%, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 62%);
    pointer-events: none;
    z-index: 0;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

const HomeSection = styled(Section)`
  position: relative;
  padding-top: var(--spacing-3xl);
`;

const CTASection = styled.section`
  padding: var(--spacing-4xl) 0;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const Card = styled.div`
  border-radius: var(--border-radius-2xl);
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.02);
  padding: 28px;
  display: grid;
  grid-template-columns: 1.2fr auto;
  align-items: center;
  gap: 20px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`;

const Text = styled.div``;

const Title = styled.h3`
  margin: 0 0 8px;
  font-size: 1.35rem;
  color: var(--color-text);
  letter-spacing: -0.02em;
`;

const P = styled.p`
  margin: 0;
  color: var(--color-muted);
  line-height: 1.7;
`;

const Buttons = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;

  @media (max-width: 900px) {
    justify-content: flex-start;
  }
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

export default function HomePage() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('home-surface');
    document.body.classList.add('home-surface');
    return () => {
      root.classList.remove('home-surface');
      document.body.classList.remove('home-surface');
    };
  }, []);

  return (
    <HomeSurface>
      <Hero />

      <HomeSection
        title="Serie"
        subtitle="Progetti coerenti: un filo narrativo, un luogo, un'idea."
      >
        <FeaturedSeries />
      </HomeSection>

      <HomeSection
        title="Selezione"
        subtitle="Una griglia di scatti recenti: clicca per aprire la foto."
      >
        <FeaturedGallery />
      </HomeSection>

      <CTASection>
        <Container>
          <Card>
            <Text>
              <Title>Esplora per luoghi</Title>
              <P>
                Se preferisci partire dalla geografia, la mappa raccoglie gli scatti per punto e ti permette di navigarci.
              </P>
            </Text>
            <Buttons>
              <Button to="/map">Apri la mappa</Button>
              <Button to="/about">Chi sono</Button>
            </Buttons>
          </Card>
        </Container>
      </CTASection>
    </HomeSurface>
  );
}
