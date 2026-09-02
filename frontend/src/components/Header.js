import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Camera, History, KeyRound } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useHeaderDesktopLayoutMode, useMediaQuery } from '../hooks';
import {
  combineMediaQueries,
  inputQueries,
  viewportQueries
} from '../styles/responsive';
import {
  HEADER_NAV_ITEMS
} from './header/headerNavigation';
import { HeaderMobileNav } from './header/HeaderMobileNav';

const HeaderContainer = styled(motion.header)`
  position: fixed;
  top: 0;
  width: 100%;
  z-index: var(--z-fixed);
  background: ${(props) => (props.$scrolled ? 'rgba(11, 11, 13, 0.92)' : 'rgba(11, 11, 13, 0.72)')};
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

const HeaderInner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
`;

const Nav = styled.nav`
  position: relative;
  padding: 0 var(--spacing-xl);
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
  height: 78px;

  ${({ $compactTouchNav }) => $compactTouchNav && `
    padding: 0 var(--spacing-lg);
    gap: 8px;
    height: 70px;
  `}
`;

const Logo = styled(motion(Link))`
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.02em;
  font-size: 1.05rem;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--color-accent);
    display: block;
    flex-shrink: 0;
  }
`;

const LogoContent = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const LogoIcon = styled.img`
  width: 35px;
  height: 35px;
  border-radius: 8px;
  object-fit: contain;
  background: transparent;

  ${({ $compactTouchNav }) => $compactTouchNav && `
    width: 28px;
    height: 28px;
  `}

  ${({ $denseDesktop }) => $denseDesktop && `
    width: 32px;
    height: 32px;
  `}
`;

const LogoText = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ${({ $compactTouchNav }) => $compactTouchNav && `
    gap: 6px;
    font-size: 0.96rem;
  `}

  ${({ $hidden }) => $hidden && `
    display: none;
  `}
`;

const NavLinks = styled.ul`
  display: flex;
  gap: var(--spacing-xl);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);

  ${({ $compact }) =>
    $compact
      ? `
    display: none;
  `
      : ''}

  ${({ $compactTouchNav }) =>
    $compactTouchNav
      ? `
    display: none;
  `
      : ''}
`;

const DesktopCompactNavRail = styled.div`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
  padding: 0 24px 14px;
`;

const DesktopCompactNavScroll = styled.div`
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const DesktopCompactNavList = styled.ul`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  width: max-content;
  min-width: 100%;
  margin: 0 auto;
`;

const DesktopCompactNavLink = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  white-space: nowrap;
  position: relative;
  transition: color 0.2s ease;

  &:hover {
    color: var(--color-text);
  }

  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 8px;
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

const DesktopNavMeasure = styled.ul`
  position: absolute;
  left: -9999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  gap: var(--spacing-xl);
  width: max-content;
  white-space: nowrap;

  ${({ $compactTouchNav }) => $compactTouchNav && `
    display: none;
  `}
`;

const DesktopNavMeasureItem = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  color: var(--color-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
`;

const StyledNavLink = styled(NavLink)`
  color: var(--color-muted);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
  letter-spacing: 0.01em;
  padding: 10px 0;
  position: relative;
  white-space: nowrap;

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
  margin-left: auto;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;

  ${({ $compactTouchNav }) => $compactTouchNav && `
    gap: 8px;
  `}

  ${({ $denseDesktop }) => $denseDesktop && `
    gap: 10px;
  `}
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

  ${({ $compactTouchNav }) => $compactTouchNav && `
    padding: 9px 12px;
    font-size: var(--font-size-xs);
  `}

  ${({ $compactTouchNav, $iconOnly }) => ($compactTouchNav || $iconOnly) && `
    width: 38px;
    height: 38px;
    padding: 0;
    justify-content: center;
    border-radius: 12px;
  `}
`;

const UploadButtonLabel = styled.span`
  white-space: nowrap;

  ${({ $compactTouchNav, $iconOnly }) => ($compactTouchNav || $iconOnly) && `
    display: none;
  `}
`;

const TokenButton = styled(motion.button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--border-radius-full);
  border: 1px solid ${(props) => {
    if (props.$feedback === 'success') return 'rgba(52, 211, 153, 0.75)';
    if (props.$feedback === 'error') return 'rgba(248, 113, 113, 0.75)';
    return props.$active ? 'rgba(52, 211, 153, 0.5)' : 'rgba(255, 255, 255, 0.2)';
  }};
  background: ${(props) => {
    if (props.$feedback === 'success') return 'rgba(52, 211, 153, 0.2)';
    if (props.$feedback === 'error') return 'rgba(248, 113, 113, 0.2)';
    return props.$active ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.04)';
  }};
  color: var(--color-text);
  transition: background 0.2s ease, border-color 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${(props) => (props.$active ? 'rgba(52, 211, 153, 0.65)' : 'rgba(255, 255, 255, 0.35)')};
  }
`;

const HistoryLink = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--border-radius-full);
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

  &:hover,
  &.active {
    transform: translateY(-1px);
    border-color: rgba(214, 179, 106, 0.55);
    background: rgba(214, 179, 106, 0.12);
  }
`;

const Header = ({
  onOpenUpload,
  isAdmin = false,
  onConfigureAuth,
  hasAuthToken = false,
  authFeedback = 'idle'
}) => {
  const [scrolled, setScrolled] = useState(false);
  const useCompactTouchNav = useMediaQuery(combineMediaQueries(
    viewportQueries.down('medium'),
    inputQueries.cannotHover,
    inputQueries.primaryCoarse
  ));
  const navRef = useRef(null);
  const brandFullMeasureRef = useRef(null);
  const brandCompactMeasureRef = useRef(null);
  const rightFullMeasureRef = useRef(null);
  const rightCompactMeasureRef = useRef(null);
  const navMeasureRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { compactDesktopNav, compactBrand, compactUpload } = useHeaderDesktopLayoutMode({
    useCompactNav: useCompactTouchNav,
    navRef,
    brandFullMeasureRef,
    brandCompactMeasureRef,
    rightFullMeasureRef,
    rightCompactMeasureRef,
    navMeasureRef
  });

  useEffect(() => {
    const root = document.documentElement;

    if (useCompactTouchNav) {
      root.style.setProperty('--header-height', '70px');
    } else if (compactDesktopNav) {
      root.style.setProperty('--header-height', '132px');
    } else {
      root.style.removeProperty('--header-height');
    }

    return () => {
      root.style.removeProperty('--header-height');
    };
  }, [compactDesktopNav, useCompactTouchNav]);

  return (
    <>
      <HeaderContainer
        $scrolled={scrolled}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <HeaderInner>
          <Nav ref={navRef} $compactTouchNav={useCompactTouchNav}>
            <Logo to="/" whileTap={{ scale: 0.98 }} aria-label="Torna alla home">
              <LogoContent>
                <LogoIcon
                  src="/favicon.svg"
                  alt=""
                  aria-hidden="true"
                  $compactTouchNav={useCompactTouchNav}
                  $denseDesktop={compactBrand}
                />
                <LogoText $compactTouchNav={useCompactTouchNav} $hidden={compactBrand}>
                  FotoPortfolio <span className="dot" />
                </LogoText>
              </LogoContent>
            </Logo>

            <NavLinks $compact={compactDesktopNav} $compactTouchNav={useCompactTouchNav}>
              {HEADER_NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <StyledNavLink to={item.to} end={item.to === '/'}>
                    {item.label}
                  </StyledNavLink>
                </li>
              ))}
            </NavLinks>

            <Right $compactTouchNav={useCompactTouchNav} $denseDesktop={compactBrand}>
              {isAdmin && hasAuthToken && (
                <HistoryLink
                  to="/admin/history"
                  title="Storico modifiche"
                  aria-label="Apri lo storico delle modifiche"
                >
                  <History size={16} />
                </HistoryLink>
              )}

              {isAdmin && onConfigureAuth && (
                <TokenButton
                  type="button"
                  onClick={onConfigureAuth}
                  whileTap={{ scale: 0.98 }}
                  $active={hasAuthToken}
                  $feedback={authFeedback}
                  title={hasAuthToken ? 'Token API configurato' : 'Configura token API'}
                  aria-label={hasAuthToken ? 'Sessione admin attiva (clicca per disattivare)' : 'Configura token admin'}
                >
                  <KeyRound size={16} />
                </TokenButton>
              )}

              {isAdmin && onOpenUpload && (
                <UploadButton
                  onClick={onOpenUpload}
                  whileTap={{ scale: 0.98 }}
                  $compactTouchNav={useCompactTouchNav}
                  $iconOnly={compactUpload}
                >
                  <Camera size={16} />
                  <UploadButtonLabel $compactTouchNav={useCompactTouchNav} $iconOnly={compactUpload}>
                    Carica
                  </UploadButtonLabel>
                </UploadButton>
              )}
            </Right>
          </Nav>

          <DesktopCompactNavRail $visible={compactDesktopNav && !useCompactTouchNav}>
            <DesktopCompactNavScroll>
              <DesktopCompactNavList>
                {HEADER_NAV_ITEMS.map((item) => (
                  <li key={item.to}>
                    <DesktopCompactNavLink to={item.to} end={item.to === '/'}>
                      {item.label}
                    </DesktopCompactNavLink>
                  </li>
                ))}
              </DesktopCompactNavList>
            </DesktopCompactNavScroll>
          </DesktopCompactNavRail>

          <DesktopNavMeasure ref={navMeasureRef} aria-hidden="true" $compactTouchNav={useCompactTouchNav}>
            {HEADER_NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <DesktopNavMeasureItem>{item.label}</DesktopNavMeasureItem>
              </li>
            ))}
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $compactTouchNav={useCompactTouchNav} ref={brandFullMeasureRef}>
            <li>
              <LogoContent>
                <LogoIcon src="/favicon.svg" alt="" aria-hidden="true" />
                <LogoText>
                  FotoPortfolio <span className="dot" />
                </LogoText>
              </LogoContent>
            </li>
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $compactTouchNav={useCompactTouchNav} ref={brandCompactMeasureRef}>
            <li>
              <LogoIcon src="/favicon.svg" alt="" aria-hidden="true" />
            </li>
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $compactTouchNav={useCompactTouchNav} ref={rightFullMeasureRef}>
            <li>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                {isAdmin && hasAuthToken && (
                  <HistoryLink to="/admin/history" aria-hidden="true">
                    <History size={16} />
                  </HistoryLink>
                )}
                {isAdmin && onConfigureAuth && (
                  <TokenButton type="button" aria-hidden="true">
                    <KeyRound size={16} />
                  </TokenButton>
                )}
                {isAdmin && onOpenUpload && (
                  <UploadButton type="button" aria-hidden="true">
                    <Camera size={16} />
                    <UploadButtonLabel>Carica</UploadButtonLabel>
                  </UploadButton>
                )}
              </div>
            </li>
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $compactTouchNav={useCompactTouchNav} ref={rightCompactMeasureRef}>
            <li>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                {isAdmin && hasAuthToken && (
                  <HistoryLink to="/admin/history" aria-hidden="true">
                    <History size={16} />
                  </HistoryLink>
                )}
                {isAdmin && onConfigureAuth && (
                  <TokenButton type="button" aria-hidden="true">
                    <KeyRound size={16} />
                  </TokenButton>
                )}
                {isAdmin && onOpenUpload && (
                  <UploadButton type="button" aria-hidden="true" $iconOnly>
                    <Camera size={16} />
                  </UploadButton>
                )}
              </div>
            </li>
          </DesktopNavMeasure>
        </HeaderInner>
      </HeaderContainer>

      <HeaderMobileNav visible={useCompactTouchNav} />
    </>
  );
};

export default Header;
