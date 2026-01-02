import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Instagram, Twitter, Youtube, Facebook, Mail, MapPin, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';

const FooterContainer = styled.footer`
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: var(--spacing-3xl) 0 var(--spacing-xl);
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const FooterGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: var(--spacing-2xl);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Title = styled.h3`
  color: var(--color-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-md);
`;

const Text = styled.p`
  color: var(--color-muted);
  line-height: 1.7;
  margin: 0 0 var(--spacing-lg) 0;
`;

const Links = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;

  a {
    color: var(--color-muted);
    font-size: var(--font-size-sm);

    &:hover {
      color: var(--color-text);
    }
  }
`;

const SocialRow = styled.div`
  display: flex;
  gap: 10px;
  margin-top: var(--spacing-md);
`;

const SocialLink = styled(motion.a)`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);

  &:hover {
    border-color: rgba(214, 179, 106, 0.35);
    background: rgba(214, 179, 106, 0.10);
    transform: translateY(-1px);
  }
`;

const ContactList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--color-muted);
  font-size: var(--font-size-sm);

  a {
    color: var(--color-muted);

    &:hover {
      color: var(--color-text);
    }
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  svg {
    color: rgba(214, 179, 106, 0.85);
  }
`;

const Bottom = styled.div`
  margin-top: var(--spacing-2xl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Small = styled.p`
  margin: 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: var(--font-size-sm);
`;

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const fade = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
  };

  return (
    <FooterContainer>
      <Container>
        <FooterGrid variants={{ show: { transition: { staggerChildren: 0.06 } } }} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-120px' }}>
          <motion.div variants={fade}>
            <Title>Portfolio Fotografico</Title>
            <Text>
              Una collezione di immagini organizzate per luoghi e serie.
              Minimal, leggibile e pensato per far parlare le foto.
            </Text>

            <SocialRow>
              <SocialLink href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" whileTap={{ scale: 0.98 }}>
                <Instagram size={18} />
              </SocialLink>
              <SocialLink href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter/X" whileTap={{ scale: 0.98 }}>
                <Twitter size={18} />
              </SocialLink>
              <SocialLink href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" whileTap={{ scale: 0.98 }}>
                <Youtube size={18} />
              </SocialLink>
              <SocialLink href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" whileTap={{ scale: 0.98 }}>
                <Facebook size={18} />
              </SocialLink>
            </SocialRow>
          </motion.div>

          <motion.div variants={fade}>
            <Title>Sezioni</Title>
            <Links>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/series">Serie</Link></li>
              <li><Link to="/gallery">Galleria</Link></li>
              <li><Link to="/map">Mappa</Link></li>
              <li><Link to="/about">Chi sono</Link></li>
              <li><Link to="/contact">Contatti</Link></li>
            </Links>
          </motion.div>

          <motion.div variants={fade}>
            <Title>Contatti</Title>
            <ContactList>
              <div className="row"><Mail size={16} /> <a href="mailto:kevinmuka03@gmail.com">kevinmuka03@gmail.com</a></div>
              <div className="row"><Globe size={16} /> <Link to="/">fotoportfolio.com</Link></div>
              <div className="row"><Instagram size={16} /> <a href="https://instagram.com/kev.muka" target="_blank" rel="noreferrer">@kev.muka</a></div>
              <div className="row"><MapPin size={16} /> <span>Italia</span></div>
            </ContactList>
          </motion.div>
        </FooterGrid>

        <Bottom>
          <Small>© {currentYear} Portfolio Fotografico</Small>
          <Small>Realizzato con React</Small>
        </Bottom>
      </Container>
    </FooterContainer>
  );
};

export default Footer;
