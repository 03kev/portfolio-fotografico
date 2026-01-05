import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowDownRight } from 'lucide-react';

const HeroSection = styled.section`
  margin-top: -80px;
  min-height: 100vh;
  display: flex;
  align-items: center;
  position: relative;
  overflow: hidden;
  padding: 80px 0 80px;
  background: transparent;
`;

const Container = styled.div`
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  position: relative;
  z-index: 1;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const Eyebrow = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--border-radius-full);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: var(--spacing-lg);
`;

const Title = styled(motion.h1)`
  font-size: clamp(2.6rem, 6vw, 4.2rem);
  font-weight: var(--font-weight-extrabold);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin-bottom: var(--spacing-lg);
  color: var(--color-text);

  span {
    color: var(--color-accent);
  }
`;

const Subtitle = styled(motion.p)`
  max-width: 720px;
  font-size: clamp(1.05rem, 2.2vw, 1.25rem);
  color: var(--color-muted);
  line-height: 1.7;
  margin: 0 0 var(--spacing-2xl) 0;
`;

const CTAGroup = styled(motion.div)`
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  flex-wrap: wrap;
`;

const PrimaryButton = styled(motion(Link))`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-radius: var(--border-radius-full);
  background: rgba(214, 179, 106, 0.16);
  border: 1px solid rgba(214, 179, 106, 0.45);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  transition: background var(--transition-normal), transform var(--transition-normal), box-shadow var(--transition-normal);

  &:hover {
    background: rgba(214, 179, 106, 0.22);
    box-shadow: var(--shadow-medium);
    transform: translateY(-1px);
  }
`;

const SecondaryLink = styled(motion(Link))`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px;
  border-radius: var(--border-radius-full);
  border: 1px solid var(--color-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-muted);
  font-weight: var(--font-weight-semibold);

  &:hover {
    color: var(--color-text);
    border-color: rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
  }
`;

const Hero = () => {
  const container = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut', staggerChildren: 0.08 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
  };

  return (
    <HeroSection>
      <Container>
        <motion.div variants={container} initial="hidden" animate="show">
          <Eyebrow variants={item}>Fotografia • Viaggi • Serie</Eyebrow>

          <Title variants={item}>
            Portfolio <span>fotografico</span>
          </Title>

          <Subtitle variants={item}>
            Una selezione curata di scatti, organizzati per luoghi e serie.
            Esplora per progetto o tramite la mappa.
          </Subtitle>

          <CTAGroup variants={item}>
            <PrimaryButton to="/map" whileTap={{ scale: 0.98 }}>
              Esplora la mappa
              <ArrowDownRight size={18} />
            </PrimaryButton>

            <SecondaryLink to="/gallery" whileTap={{ scale: 0.98 }}>
              Vai all'archivio
            </SecondaryLink>
          </CTAGroup>
        </motion.div>
      </Container>
    </HeroSection>
  );
};

export default Hero;
