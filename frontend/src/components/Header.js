import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, FolderOpen, Grid3X3, House, KeyRound, Mail, Map, UserRound } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useMeasuredLayoutMode, useMobileDeviceLayout } from '../hooks';

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

  ${({ $mobileLayout }) => $mobileLayout && `
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

  ${({ $mobileLayout }) => $mobileLayout && `
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

  ${({ $mobileLayout }) => $mobileLayout && `
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

  @media (min-width: 769px), ((max-width: 768px) and (hover: hover)) {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  ${({ $compact }) =>
    $compact
      ? `
    display: none;
  `
      : ''}

  ${({ $mobileLayout }) =>
    $mobileLayout
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

  ${({ $mobileLayout }) => $mobileLayout && `
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

  ${({ $mobileLayout }) => $mobileLayout && `
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

  ${({ $mobileLayout }) => $mobileLayout && `
    padding: 9px 12px;
    font-size: var(--font-size-xs);
  `}

  ${({ $mobileLayout, $iconOnly }) => ($mobileLayout || $iconOnly) && `
    width: 38px;
    height: 38px;
    padding: 0;
    justify-content: center;
    border-radius: 12px;
  `}
`;

const UploadButtonLabel = styled.span`
  white-space: nowrap;

  ${({ $mobileLayout, $iconOnly }) => ($mobileLayout || $iconOnly) && `
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

const MobileBottomNavBackdrop = styled(motion.button)`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-fixed) - 1);
    border: 0;
    background: rgba(4, 6, 12, 0.32);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  `}
`;

const MobileBottomNav = styled.nav`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    position: fixed;
    left: max(12px, env(safe-area-inset-left));
    right: max(12px, env(safe-area-inset-right));
    bottom: max(12px, env(safe-area-inset-bottom));
    z-index: var(--z-fixed);
    padding: 10px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(17, 19, 27, 0.92);
    box-shadow: 0 24px 46px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  `}
`;

const MobileBottomNavList = styled.ul`
  display: none;

  ${({ $visible }) => $visible && `
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    list-style: none;
  `}
`;

const MobileBottomNavItem = styled.li`
  min-width: 0;
`;

const mobileBottomNavShared = `
  width: 100%;
  min-height: 58px;
  padding: 8px 6px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-muted);
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.71rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
`;

const MobileBottomNavLink = styled(NavLink)`
  ${mobileBottomNavShared}

  &.active {
    color: var(--color-text);
    background: rgba(214, 179, 106, 0.12);
    border-color: rgba(214, 179, 106, 0.24);
  }
`;

const MobileBottomNavButton = styled.button`
  ${mobileBottomNavShared}
  cursor: pointer;

  ${(props) =>
    props.$active
      ? `
    color: var(--color-text);
    background: rgba(214, 179, 106, 0.12);
    border-color: rgba(214, 179, 106, 0.24);
  `
      : ''}
`;

const BottomNavLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`;

const MobileMoreSheet = styled(motion.div)`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    position: fixed;
    left: max(12px, env(safe-area-inset-left));
    right: max(12px, env(safe-area-inset-right));
    bottom: calc(max(12px, env(safe-area-inset-bottom)) + 94px);
    z-index: var(--z-fixed);
    padding: 10px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(17, 19, 27, 0.94);
    box-shadow: 0 22px 40px rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  `}
`;

const MobileMoreSheetList = styled.div`
  display: grid;
  gap: 8px;
`;

const MobileMoreSheetLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;

  &.active {
    background: rgba(214, 179, 106, 0.12);
    border-color: rgba(214, 179, 106, 0.24);
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const location = useLocation();
  const useMobileNav = useMobileDeviceLayout();
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

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location.pathname]);

  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/series', label: 'Serie' },
    { to: '/map', label: 'Mappa' },
    { to: '/gallery', label: 'Archivio' },
    { to: '/about', label: 'Chi sono' },
    { to: '/contact', label: 'Contatti' }
  ];

  const mobilePrimaryItems = [
    { to: '/', label: 'Home', icon: House },
    { to: '/series', label: 'Serie', icon: Grid3X3 },
    { to: '/map', label: 'Mappa', icon: Map },
    { to: '/gallery', label: 'Archivio', icon: FolderOpen }
  ];

  const mobileSecondaryItems = [
    { to: '/about', label: 'Chi sono', icon: UserRound },
    { to: '/contact', label: 'Contatti', icon: Mail }
  ];

  const resolveDesktopLayoutMode = useCallback(() => {
    if (useMobileNav) return 'mobile';
    if (
      !navRef.current ||
      !brandFullMeasureRef.current ||
      !brandCompactMeasureRef.current ||
      !rightFullMeasureRef.current ||
      !rightCompactMeasureRef.current ||
      !navMeasureRef.current
    ) {
      return 'inline-full';
    }

    const navStyles = window.getComputedStyle(navRef.current);
    const paddingInline =
      (parseFloat(navStyles.paddingLeft || '0') || 0) +
      (parseFloat(navStyles.paddingRight || '0') || 0);
    const availableWidth = Math.max(navRef.current.clientWidth - paddingInline, 0);

    const brandFullWidth = brandFullMeasureRef.current.offsetWidth;
    const brandCompactWidth = brandCompactMeasureRef.current.offsetWidth;
    const rightFullWidth = rightFullMeasureRef.current.offsetWidth;
    const rightCompactWidth = rightCompactMeasureRef.current.offsetWidth;
    const navLinksWidth = navMeasureRef.current.scrollWidth;

    const fitsInline = (brandWidth, rightWidth) => {
      const sideWidth = Math.max(brandWidth, rightWidth);
      const centerSafetyGap = 112;
      return availableWidth >= sideWidth * 2 + navLinksWidth + centerSafetyGap;
    };

    const fitsStacked = (brandWidth, rightWidth) => {
      const topRowGap = 24;
      return availableWidth >= brandWidth + rightWidth + topRowGap;
    };

    if (fitsInline(brandFullWidth, rightFullWidth)) return 'inline-full';
    if (fitsInline(brandFullWidth, rightCompactWidth)) return 'inline-compact-upload';
    if (fitsStacked(brandFullWidth, rightFullWidth)) return 'stacked-full';
    if (fitsStacked(brandFullWidth, rightCompactWidth)) return 'stacked-compact-upload';
    if (fitsStacked(brandCompactWidth, rightCompactWidth)) return 'stacked-compact-brand';

    return 'stacked-compact-brand';
  }, [useMobileNav]);

  const layoutMode = useMeasuredLayoutMode({
    enabled: true,
    initialMode: 'inline-full',
    observedRefs: [
      navRef,
      brandFullMeasureRef,
      brandCompactMeasureRef,
      rightFullMeasureRef,
      rightCompactMeasureRef,
      navMeasureRef
    ],
    resolveMode: resolveDesktopLayoutMode
  });

  const compactDesktopNav = !useMobileNav && layoutMode.startsWith('stacked');
  const compactBrand = layoutMode === 'stacked-compact-brand';
  const compactUpload =
    layoutMode === 'inline-compact-upload' ||
    layoutMode === 'stacked-compact-upload' ||
    layoutMode === 'stacked-compact-brand';

  useEffect(() => {
    const root = document.documentElement;

    if (useMobileNav) {
      root.style.setProperty('--header-height', '70px');
    } else if (compactDesktopNav) {
      root.style.setProperty('--header-height', '132px');
    } else {
      root.style.removeProperty('--header-height');
    }

    return () => {
      root.style.removeProperty('--header-height');
    };
  }, [compactDesktopNav, useMobileNav]);

  return (
    <>
      <HeaderContainer
        $scrolled={scrolled}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <HeaderInner>
          <Nav ref={navRef} $mobileLayout={useMobileNav}>
            <Logo to="/" whileTap={{ scale: 0.98 }} aria-label="Torna alla home">
              <LogoContent>
                <LogoIcon
                  src="/favicon.svg"
                  alt=""
                  aria-hidden="true"
                  $mobileLayout={useMobileNav}
                  $denseDesktop={compactBrand}
                />
                <LogoText $mobileLayout={useMobileNav} $hidden={compactBrand}>
                  FotoPortfolio <span className="dot" />
                </LogoText>
              </LogoContent>
            </Logo>

            <NavLinks $compact={compactDesktopNav} $mobileLayout={useMobileNav}>
              {navItems.map((item) => (
                <li key={item.to}>
                  <StyledNavLink to={item.to} end={item.to === '/'}>
                    {item.label}
                  </StyledNavLink>
                </li>
              ))}
            </NavLinks>

            <Right $mobileLayout={useMobileNav} $denseDesktop={compactBrand}>
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
                  $mobileLayout={useMobileNav}
                  $iconOnly={compactUpload}
                >
                  <Camera size={16} />
                  <UploadButtonLabel $mobileLayout={useMobileNav} $iconOnly={compactUpload}>
                    Carica
                  </UploadButtonLabel>
                </UploadButton>
              )}
            </Right>
          </Nav>

          <DesktopCompactNavRail $visible={compactDesktopNav && !useMobileNav}>
            <DesktopCompactNavScroll>
              <DesktopCompactNavList>
                {navItems.map((item) => (
                  <li key={item.to}>
                    <DesktopCompactNavLink to={item.to} end={item.to === '/'}>
                      {item.label}
                    </DesktopCompactNavLink>
                  </li>
                ))}
              </DesktopCompactNavList>
            </DesktopCompactNavScroll>
          </DesktopCompactNavRail>

          <DesktopNavMeasure ref={navMeasureRef} aria-hidden="true" $mobileLayout={useMobileNav}>
            {navItems.map((item) => (
              <li key={item.to}>
                <DesktopNavMeasureItem>{item.label}</DesktopNavMeasureItem>
              </li>
            ))}
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $mobileLayout={useMobileNav} ref={brandFullMeasureRef}>
            <li>
              <LogoContent>
                <LogoIcon src="/favicon.svg" alt="" aria-hidden="true" />
                <LogoText>
                  FotoPortfolio <span className="dot" />
                </LogoText>
              </LogoContent>
            </li>
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $mobileLayout={useMobileNav} ref={brandCompactMeasureRef}>
            <li>
              <LogoIcon src="/favicon.svg" alt="" aria-hidden="true" />
            </li>
          </DesktopNavMeasure>

          <DesktopNavMeasure aria-hidden="true" $mobileLayout={useMobileNav} ref={rightFullMeasureRef}>
            <li>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
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

          <DesktopNavMeasure aria-hidden="true" $mobileLayout={useMobileNav} ref={rightCompactMeasureRef}>
            <li>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
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

      <AnimatePresence>
        {mobileMoreOpen && (
          <>
            <MobileBottomNavBackdrop
              $visible={useMobileNav}
              type="button"
              aria-label="Chiudi menu mobile"
              onClick={() => setMobileMoreOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <MobileMoreSheet
              $visible={useMobileNav}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <MobileMoreSheetList>
                {mobileSecondaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <MobileMoreSheetLink key={item.to} to={item.to}>
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </MobileMoreSheetLink>
                  );
                })}
              </MobileMoreSheetList>
            </MobileMoreSheet>
          </>
        )}
      </AnimatePresence>

      <MobileBottomNav aria-label="Navigazione mobile" $visible={useMobileNav}>
        <MobileBottomNavList $visible={useMobileNav}>
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <MobileBottomNavItem key={item.to}>
                <MobileBottomNavLink to={item.to} end={item.to === '/'}>
                  <Icon size={18} />
                  <BottomNavLabel>{item.label}</BottomNavLabel>
                </MobileBottomNavLink>
              </MobileBottomNavItem>
            );
          })}
          <MobileBottomNavItem>
            <MobileBottomNavButton
              type="button"
              $active={mobileMoreOpen || mobileSecondaryItems.some((item) => location.pathname === item.to)}
              onClick={() => setMobileMoreOpen((open) => !open)}
              aria-expanded={mobileMoreOpen}
              aria-label="Altre sezioni"
            >
              <UserRound size={18} />
              <BottomNavLabel>Altro</BottomNavLabel>
            </MobileBottomNavButton>
          </MobileBottomNavItem>
        </MobileBottomNavList>
      </MobileBottomNav>
    </>
  );
};

export default Header;
