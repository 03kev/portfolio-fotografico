import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const FooterContainer = styled.footer`
  background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: var(--spacing-3xl) 0 var(--spacing-xl);
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const FooterContent = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--spacing-2xl);
  margin-bottom: var(--spacing-2xl);

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-xl);
    text-align: center;
  }
`;

const FooterSection = styled(motion.div)`
  h3 {
    color: var(--color-white);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-md);
    position: relative;

    &::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 0;
      width: 40px;
      height: 2px;
      background: var(--accent-gradient);

      @media (max-width: 768px) {
        left: 50%;
        transform: translateX(-50%);
      }
    }
  }

  p {
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.6;
    margin-bottom: var(--spacing-sm);
  }

  ul {
    list-style: none;
    
    li {
      margin-bottom: var(--spacing-sm);
    }

    a {
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
      transition: all var(--transition-normal);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);

      &:hover {
        color: var(--color-accent);
        transform: translateX(5px);
      }

      @media (max-width: 768px) {
        justify-content: center;
      }
    }
  }
`;

const SocialLinks = styled.div`
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);

  @media (max-width: 768px) {
    justify-content: center;
  }
`;

const SocialLink = styled(motion.a)`
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-white);
  font-size: var(--font-size-xl);
  text-decoration: none;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    background: var(--accent-gradient);
    border-color: transparent;
    transform: translateY(-3px);
    box-shadow: 0 10px 20px rgba(79, 172, 254, 0.3);
  }
`;

const ContactInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);

  .contact-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--font-size-sm);

    @media (max-width: 768px) {
      justify-content: center;
    }

    .icon {
      font-size: var(--font-size-base);
      color: var(--color-accent);
    }
  }
`;

const Newsletter = styled.div`
  background: rgba(255, 255, 255, 0.05);
  padding: var(--spacing-lg);
  border-radius: var(--border-radius-xl);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);

  h4 {
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-sm);
  }

  p {
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-md);
  }
`;

const NewsletterForm = styled.form`
  display: flex;
  gap: var(--spacing-sm);

  @media (max-width: 480px) {
    flex-direction: column;
  }

  input {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--border-radius);
    color: var(--color-white);
    font-size: var(--font-size-sm);

    &::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      background: rgba(255, 255, 255, 0.15);
    }
  }

  button {
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--accent-gradient);
    color: var(--color-white);
    border: none;
    border-radius: var(--border-radius);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(79, 172, 254, 0.3);
    }
  }
`;

const FooterBottom = styled(motion.div)`
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: var(--spacing-lg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
  }
`;

const Copyright = styled.p`
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-sm);
  margin: 0;
`;

const FooterLinks = styled.div`
  display: flex;
  gap: var(--spacing-lg);

  @media (max-width: 480px) {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  a {
    color: rgba(255, 255, 255, 0.6);
    text-decoration: none;
    font-size: var(--font-size-sm);
    transition: all var(--transition-normal);

    &:hover {
      color: var(--color-accent);
    }
  }
`;

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    // Implementa logica newsletter
    console.log('Newsletter subscription');
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 }
    }
  };

  return (
    <FooterContainer id="contatti">
      <Container>
        <FooterContent
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <FooterSection variants={itemVariants}>
            <h3>Portfolio Fotografico</h3>
            <p>
              Catturando momenti unici da ogni angolo del mondo. 
              Ogni scatto racconta una storia, ogni viaggio un'emozione.
            </p>
            <SocialLinks>
              <SocialLink
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                📷
              </SocialLink>
              <SocialLink
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                🐦
              </SocialLink>
              <SocialLink
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                📘
              </SocialLink>
              <SocialLink
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                🎥
              </SocialLink>
            </SocialLinks>
          </FooterSection>

          <FooterSection variants={itemVariants}>
            <h3>Link Rapidi</h3>
            <ul>
              <li>
                <a href="#home">🏠 Home</a>
              </li>
              <li>
                <a href="#mappa">🗺️ Mappa</a>
              </li>
              <li>
                <a href="#galleria">📸 Galleria</a>
              </li>
              <li>
                <a href="#contatti">📞 Contatti</a>
              </li>
            </ul>
          </FooterSection>

          <FooterSection variants={itemVariants}>
            <h3>Contatti</h3>
            <ContactInfo>
              <div className="contact-item">
                <span className="icon">📧</span>
                <span>foto@portfolio.com</span>
              </div>
              <div className="contact-item">
                <span className="icon">📱</span>
                <span>+39 123 456 7890</span>
              </div>
              <div className="contact-item">
                <span className="icon">📍</span>
                <span>Bologna, Italia</span>
              </div>
              <div className="contact-item">
                <span className="icon">🌐</span>
                <span>www.fotoportfolio.com</span>
              </div>
            </ContactInfo>
          </FooterSection>

          <FooterSection variants={itemVariants}>
            <Newsletter>
              <h4>Newsletter</h4>
              <p>Resta aggiornato sui miei ultimi viaggi e foto</p>
              <NewsletterForm onSubmit={handleNewsletterSubmit}>
                <input
                  type="email"
                  placeholder="La tua email"
                  required
                />
                <button type="submit">Iscriviti</button>
              </NewsletterForm>
            </Newsletter>
          </FooterSection>
        </FooterContent>

        <FooterBottom
          variants={itemVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <Copyright>
            © {currentYear} Portfolio Fotografico. Tutti i diritti riservati.
          </Copyright>
          <FooterLinks>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Termini di Servizio</a>
            <a href="/cookies">Cookie Policy</a>
          </FooterLinks>
        </FooterBottom>
      </Container>
    </FooterContainer>
  );
};

export default Footer;
