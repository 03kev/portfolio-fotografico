import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Menu, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const HeaderContainer = styled(motion.header)`
  position: fixed;
  top: 0;
  width: 100%;
  z-index: var(--z-fixed);
  background: ${(props) => (props.scrolled ? 'rgba(11, 11, 13, 0.92)' : 'rgba(11, 11, 13, 0.72)')};
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const Nav = styled.nav`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 78px;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
    height: 70px;
  }
`;

const Logo = styled(motion(Link))`
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.02em;
  font-size: 1.05rem;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--color-accent);
    display: inline-block;
  }
`;

const NavLinks = styled.ul`
  display: flex;
  gap: var(--spacing-xl);

  @media (max-width: 768px) {
    display: none;
  }
`;

const StyledNavLink = styled(NavLink)`
  color: var(--color-muted);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
  letter-spacing: 0.01em;
  padding: 10px 0;
  position: relative;

  &:hover {
    color: var(--color-text);
  }

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 2px;
    width: 0;
    height: 2px;
    background: rgba(214, 179, 106, 0.65);
    transition: width var(--transition-normal);
  }

  &:hover::after {
    width: 100%;
  }

  &.active {
    color: var(--color-text);
  }

  &.active::after {
    width: 100%;
  }
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const UploadButton = styled(motion.button)`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--border-radius-full);
  border: 1px solid rgba(214, 179, 106, 0.45);
  background: rgba(214, 179, 106, 0.12);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);

  &:hover {
    background: rgba(214, 179, 106, 0.18);
    box-shadow: var(--shadow-small);
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    padding: 9px 12px;
    font-size: var(--font-size-xs);
  }
`;

const MobileMenuButton = styled(motion.button)`
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  display: none;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    display: inline-flex;
  }
`;

const MobileMenu = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(11, 11, 13, 0.96);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 14px 0;
`;

const MobileNavLinks = styled.ul`
  list-style: none;
  padding: 0 var(--spacing-lg);
`;

const MobileNavItem = styled(motion.li)`
  margin: 8px 0;
`;

const MobileLink = styled(NavLink)`
  color: var(--color-muted);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-lg);
  display: block;
  padding: 10px 0;

  &:hover {
    color: var(--color-text);
  }

  &.active {
    color: var(--color-text);
  }
`;

const Header = ({ onOpenUpload, isAdmin = false }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/series', label: 'Serie' },
    { to: '/map', label: 'Mappa' },
    { to: '/gallery', label: 'Archivio' },
    { to: '/about', label: 'Chi sono' },
    { to: '/contact', label: 'Contatti' }
  ];

  return (
    <HeaderContainer
      scrolled={scrolled}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <Nav>
        <Logo to="/" whileTap={{ scale: 0.98 }} aria-label="Torna alla home">
          FotoPortfolio <span className="dot" />
        </Logo>

        <NavLinks>
          {navItems.map((item) => (
            <li key={item.to}>
              <StyledNavLink to={item.to} end={item.to === '/'}>
                {item.label}
              </StyledNavLink>
            </li>
          ))}
        </NavLinks>

        <Right>
          {isAdmin && onOpenUpload && (
            <UploadButton onClick={onOpenUpload} whileTap={{ scale: 0.98 }}>
              <Camera size={16} />
              Carica
            </UploadButton>
          )}

          <MobileMenuButton
            onClick={() => setMobileMenuOpen((v) => !v)}
            whileTap={{ scale: 0.95 }}
            aria-label={mobileMenuOpen ? 'Chiudi menu' : 'Apri menu'}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </MobileMenuButton>
        </Right>
      </Nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <MobileMenu
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <MobileNavLinks>
              {navItems.map((item) => (
                <MobileNavItem key={item.to} whileTap={{ scale: 0.98 }}>
                  <MobileLink to={item.to} end={item.to === '/'}>
                    {item.label}
                  </MobileLink>
                </MobileNavItem>
              ))}
            </MobileNavLinks>
          </MobileMenu>
        )}
      </AnimatePresence>
    </HeaderContainer>
  );
};

export default Header;
