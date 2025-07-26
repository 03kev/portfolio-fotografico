import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';

const HeaderContainer = styled(motion.header)`
  position: fixed;
  top: 0;
  width: 100%;
  z-index: var(--z-fixed);
  background: ${props => props.scrolled 
    ? 'rgba(0, 0, 0, 0.95)' 
    : 'rgba(0, 0, 0, 0.8)'};
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--transition-normal);
`;

const Nav = styled.nav`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 80px;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
    height: 70px;
  }
`;

const Logo = styled(motion.div)`
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-black);
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  cursor: pointer;

  @media (max-width: 768px) {
    font-size: var(--font-size-xl);
  }
`;

const NavLinks = styled.ul`
  display: flex;
  gap: var(--spacing-2xl);
  list-style: none;

  @media (max-width: 768px) {
    display: none;
  }
`;

const NavLink = styled(motion.li)`
  a {
    color: var(--color-white);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    position: relative;
    transition: all var(--transition-normal);

    &:hover {
      color: var(--color-accent);
    }

    &::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 0;
      width: 0;
      height: 2px;
      background: var(--accent-gradient);
      transition: width var(--transition-normal);
    }

    &:hover::after {
      width: 100%;
    }
  }
`;

const MobileMenuButton = styled(motion.button)`
  display: none;
  flex-direction: column;
  justify-content: space-around;
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;

  @media (max-width: 768px) {
    display: flex;
  }
`;

const MenuLine = styled(motion.span)`
  width: 30px;
  height: 3px;
  background: var(--color-white);
  border-radius: 10px;
  transform-origin: center;
`;

const MobileMenu = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: var(--spacing-lg) 0;
`;

const MobileNavLinks = styled.ul`
  list-style: none;
  padding: 0 var(--spacing-lg);
`;

const MobileNavLink = styled(motion.li)`
  margin-bottom: var(--spacing-lg);

  a {
    color: var(--color-white);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-lg);
    display: block;
    padding: var(--spacing-sm) 0;
    transition: all var(--transition-normal);

    &:hover {
      color: var(--color-accent);
      padding-left: var(--spacing-md);
    }
  }
`;

const UploadButton = styled(motion.button)`
  background: var(--primary-gradient);
  border: none;
  color: white;
  padding: 12px 20px;
  border-radius: 25px;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
  }

  @media (max-width: 768px) {
    padding: 10px 16px;
    font-size: var(--font-size-xs);
  }
`;

const Header = ({ onOpenUpload }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const offset = window.scrollY;
      setScrolled(offset > 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navItems = [
    { id: 'home', label: 'Home', onClick: scrollToTop },
    { id: 'mappa', label: 'Mappa' },
    { id: 'galleria', label: 'Galleria' },
    { id: 'contatti', label: 'Contatti' }
  ];

  return (
    <HeaderContainer
      scrolled={scrolled}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <Nav>
        <Logo
          onClick={scrollToTop}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          FotoPortfolio
        </Logo>

        <NavLinks>
          {navItems.map((item, index) => (
            <NavLink
              key={item.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              whileHover={{ y: -2 }}
            >
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.onClick) {
                    item.onClick();
                  } else {
                    scrollToSection(item.id);
                  }
                }}
              >
                {item.label}
              </a>
            </NavLink>
          ))}
        </NavLinks>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {onOpenUpload && (
            <UploadButton
              onClick={onOpenUpload}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              📸 Carica Foto
            </UploadButton>
          )}

          <MobileMenuButton
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            whileTap={{ scale: 0.9 }}
          >
            <MenuLine
              animate={{
                rotate: mobileMenuOpen ? 45 : 0,
                y: mobileMenuOpen ? 8 : 0
              }}
              transition={{ duration: 0.3 }}
            />
            <MenuLine
              animate={{
                opacity: mobileMenuOpen ? 0 : 1
              }}
              transition={{ duration: 0.3 }}
            />
            <MenuLine
              animate={{
                rotate: mobileMenuOpen ? -45 : 0,
                y: mobileMenuOpen ? -8 : 0
              }}
              transition={{ duration: 0.3 }}
            />
          </MobileMenuButton>
        </div>
      </Nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <MobileMenu
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <MobileNavLinks>
              {onOpenUpload && (
                <MobileNavLink
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0 }}
                >
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenUpload();
                      setMobileMenuOpen(false);
                    }}
                    style={{ color: 'var(--color-accent)' }}
                  >
                    📸 Carica Foto
                  </a>
                </MobileNavLink>
              )}
              {navItems.map((item, index) => (
                <MobileNavLink
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: (index + 1) * 0.1 }}
                >
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (item.onClick) {
                        item.onClick();
                      } else {
                        scrollToSection(item.id);
                      }
                    }}
                  >
                    {item.label}
                  </a>
                </MobileNavLink>
              ))}
            </MobileNavLinks>
          </MobileMenu>
        )}
      </AnimatePresence>
    </HeaderContainer>
  );
};

export default Header;
