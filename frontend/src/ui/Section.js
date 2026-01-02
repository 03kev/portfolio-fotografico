import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const SectionRoot = styled.section`
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

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  margin-bottom: var(--spacing-2xl);
`;

const Title = styled(motion.h2)`
  margin: 0;
  font-size: clamp(1.8rem, 3.2vw, 2.6rem);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -0.03em;
  color: var(--color-text);
`;

const Subtitle = styled(motion.p)`
  margin: 0;
  max-width: 720px;
  color: var(--color-muted);
  line-height: 1.7;
`;

export default function Section({ title, subtitle, children, id, ...rest }) {
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
  };

  return (
    <SectionRoot id={id} {...rest}>
      <Container>
        {(title || subtitle) && (
          <Header>
            {title && <Title variants={item} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }}>{title}</Title>}
            {subtitle && <Subtitle variants={item} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }}>{subtitle}</Subtitle>}
          </Header>
        )}
        {children}
      </Container>
    </SectionRoot>
  );
}
