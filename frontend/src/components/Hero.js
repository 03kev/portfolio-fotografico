import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const HeroSection = styled.section`
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  position: relative;
  background: var(--dark-gradient);
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="1" fill="rgba(255,255,255,0.05)"/></svg>') repeat;
    background-size: 100px 100px;
    animation: float 20s infinite linear;
    pointer-events: none;
  }

  @keyframes float {
    0% { transform: translateY(0px); }
    100% { transform: translateY(-100px); }
  }
`;

const ParticleContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
`;

const Particle = styled(motion.div)`
  position: absolute;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  background: ${props => props.color};
  border-radius: 50%;
  opacity: 0.6;
`;

const HeroContent = styled(motion.div)`
  position: relative;
  z-index: 10;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
`;

const Title = styled(motion.h1)`
  font-size: clamp(3rem, 8vw, 6rem);
  font-weight: var(--font-weight-black);
  margin-bottom: var(--spacing-lg);
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.1;
`;

const Subtitle = styled(motion.p)`
  font-size: clamp(1.1rem, 3vw, 1.5rem);
  margin-bottom: var(--spacing-2xl);
  opacity: 0.9;
  font-weight: var(--font-weight-normal);
  line-height: 1.6;
`;

const CTAButton = styled(motion.a)`
  display: inline-block;
  padding: var(--spacing-lg) var(--spacing-2xl);
  background: var(--accent-gradient);
  color: var(--color-white);
  text-decoration: none;
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-lg);
  position: relative;
  overflow: hidden;
  transition: all var(--transition-normal);

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left 0.5s;
  }

  &:hover::before {
    left: 100%;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 20px 40px rgba(79, 172, 254, 0.4);
  }
`;

const ScrollIndicator = styled(motion.div)`
  position: absolute;
  bottom: var(--spacing-2xl);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity var(--transition-normal);

  &:hover {
    opacity: 1;
  }

  span {
    font-size: var(--font-size-sm);
    color: var(--color-white);
    font-weight: var(--font-weight-medium);
  }
`;

const ScrollArrow = styled(motion.div)`
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-white);
  border-left: none;
  border-top: none;
  transform: rotate(45deg);
`;

const Hero = () => {
  const scrollToMap = () => {
    const mapSection = document.getElementById('mappa');
    if (mapSection) {
      mapSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Generate particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    size: Math.random() * 6 + 2,
    color: `rgba(${Math.random() > 0.5 ? '103, 126, 234' : '79, 172, 254'}, ${Math.random() * 0.5 + 0.2})`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 10 + 10
  }));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.8,
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut"
      }
    }
  };

  return (
    <HeroSection id="home">
      <ParticleContainer>
        {particles.map(particle => (
          <Particle
            key={particle.id}
            size={particle.size}
            color={particle.color}
            initial={{
              x: `${particle.x}vw`,
              y: `${particle.y}vh`,
              opacity: 0
            }}
            animate={{
              x: `${particle.x + (Math.random() - 0.5) * 20}vw`,
              y: `${particle.y - 20}vh`,
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        ))}
      </ParticleContainer>

      <HeroContent
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <Title variants={itemVariants}>
          Portfolio Fotografico
        </Title>
        
        <Subtitle variants={itemVariants}>
          Esplora il mondo attraverso i miei scatti. Ogni foto racconta una storia,
          ogni luogo nasconde un'emozione.
        </Subtitle>
        
        <motion.div variants={itemVariants}>
          <CTAButton
            href="#mappa"
            onClick={(e) => {
              e.preventDefault();
              scrollToMap();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Esplora la Mappa
          </CTAButton>
        </motion.div>
      </HeroContent>

      <ScrollIndicator
        onClick={scrollToMap}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.7, y: 0 }}
        transition={{ duration: 1, delay: 2 }}
        whileHover={{ opacity: 1, scale: 1.1 }}
      >
        <span>Scorri per esplorare</span>
        <ScrollArrow
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </ScrollIndicator>
    </HeroSection>
  );
};

export default Hero;
