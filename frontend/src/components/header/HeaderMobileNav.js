import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { Ellipsis } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAutoHideOnScroll } from '../../hooks';
import { HEADER_MOBILE_PRIMARY_ITEMS, HEADER_MOBILE_SECONDARY_ITEMS } from './headerNavigation';

const MobileBottomNavDock = styled.div`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    position: fixed;
    left: 50%;
    width: min(calc(100vw - 20px), 460px);
    bottom: max(10px, env(safe-area-inset-bottom));
    z-index: var(--z-fixed);
    --mobile-nav-columns: 5;
    --mobile-nav-gap: 2px;
    --mobile-nav-pad-x: 10px;
    --mobile-nav-pad-top: 8px;
    --mobile-nav-pad-bottom: calc(8px + env(safe-area-inset-bottom));
    --mobile-nav-slot-width: calc(((100% - (var(--mobile-nav-pad-x) * 2)) - ((var(--mobile-nav-columns) - 1) * var(--mobile-nav-gap))) / var(--mobile-nav-columns));
  `}

  transform: translateX(-50%) translateY(${({ $hidden }) => ($hidden ? 'calc(100% + 16px)' : '0')});
  opacity: ${({ $hidden }) => ($hidden ? 0 : 1)};
  pointer-events: ${({ $hidden }) => ($hidden ? 'none' : 'auto')};
  transition: transform 0.26s ease, opacity 0.22s ease;
`;

const MobileBottomNav = styled.nav`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    width: 100%;
    padding: var(--mobile-nav-pad-top) var(--mobile-nav-pad-x) var(--mobile-nav-pad-bottom);
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background:
      linear-gradient(180deg, rgba(16, 18, 26, 0.6), rgba(6, 8, 13, 0.78));
    box-shadow:
      0 16px 34px rgba(0, 0, 0, 0.24),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 -12px 22px rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(28px) saturate(128%);
    -webkit-backdrop-filter: blur(28px) saturate(128%);
  `}
`;

const MobileBottomNavList = styled.ul`
  display: none;

  ${({ $visible }) => $visible && `
    display: grid;
    grid-template-columns: repeat(var(--mobile-bottom-nav-columns, var(--mobile-nav-columns)), minmax(0, 1fr));
    gap: var(--mobile-nav-gap);
    list-style: none;
  `}
`;

const MobileBottomNavItem = styled.li`
  min-width: 0;
`;

const mobileBottomNavShared = `
  width: 100%;
  min-height: 52px;
  padding: 7px 4px 6px;
  border-radius: 14px;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  position: relative;
  transition: color 0.2s ease, transform 0.2s ease, background 0.2s ease;
`;

const MobileBottomNavLink = styled(NavLink)`
  ${mobileBottomNavShared}

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 22px;
    height: 2px;
    border-radius: 999px;
    background: transparent;
    transform: translateX(-50%);
    transition: background 0.2s ease, width 0.2s ease;
  }

  &.active {
    color: var(--color-accent);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  }

  &.active::after {
    background: rgba(214, 179, 106, 0.92);
  }

  svg {
    opacity: 0.84;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  &.active svg {
    opacity: 1;
    transform: translateY(-1px);
  }
`;

const MobileBottomNavButton = styled.button`
  ${mobileBottomNavShared}
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 22px;
    height: 2px;
    border-radius: 999px;
    background: transparent;
    transform: translateX(-50%);
    transition: background 0.2s ease, width 0.2s ease;
  }

  ${({ $active }) => $active && `
    color: var(--color-accent);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));

    &::after {
      background: rgba(214, 179, 106, 0.92);
    }

    svg {
      opacity: 1;
      transform: translateY(-1px);
    }
  `}

  ${({ $active }) => !$active && `
    svg {
      opacity: 0.84;
    }
  `}
`;

const BottomNavLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  line-height: 1;
`;

const MobileMoreSheet = styled(motion.div)`
  display: none;

  ${({ $visible }) => $visible && `
    display: block;
    position: absolute;
    right: 0;
    bottom: calc(100% + 10px);
    width: calc(
      (var(--mobile-nav-slot-width) * var(--mobile-more-columns, 2)) +
      (var(--mobile-nav-gap) * (var(--mobile-more-columns, 2) - 1)) +
      (var(--mobile-nav-pad-x) * 2)
    );
    max-width: 100%;
    padding: 8px var(--mobile-nav-pad-x);
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background:
      linear-gradient(180deg, rgba(16, 18, 26, 0.6), rgba(6, 8, 13, 0.78));
    box-shadow:
      0 16px 34px rgba(0, 0, 0, 0.24),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset,
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      inset 0 -12px 22px rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(28px) saturate(128%);
    -webkit-backdrop-filter: blur(28px) saturate(128%);
  `}
`;

const MobileMoreSheetList = styled.div`
  display: grid;
  grid-template-columns: repeat(var(--mobile-more-columns, 2), minmax(0, 1fr));
  gap: var(--mobile-nav-gap);
`;

const MobileMoreSheetLink = styled(NavLink)`
  ${mobileBottomNavShared}
  min-height: 52px;
  padding: 7px 6px 6px;
  border-radius: 14px;

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 22px;
    height: 2px;
    border-radius: 999px;
    background: transparent;
    transform: translateX(-50%);
    transition: background 0.2s ease, width 0.2s ease;
  }

  svg {
    opacity: 0.84;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  &.active {
    color: var(--color-accent);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
  }

  &.active::after {
    background: rgba(214, 179, 106, 0.92);
  }

  &.active svg {
    opacity: 1;
    transform: translateY(-1px);
  }
`;

const MobileMoreSheetLabel = styled.span`
  font-size: 0.68rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`;

export const HeaderMobileNav = React.memo(function HeaderMobileNav({ visible }) {
  const location = useLocation();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileBottomNavVisible = useAutoHideOnScroll({
    enabled: visible && !mobileMoreOpen,
    topVisibleOffset: 12,
    hideDelta: 18,
    showDelta: 10
  });
  const mobileMoreSheetRef = useRef(null);
  const mobileMoreButtonRef = useRef(null);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!visible || !mobileMoreOpen) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileMoreSheetRef.current?.contains(target)) return;
      if (mobileMoreButtonRef.current?.contains(target)) return;
      setMobileMoreOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [mobileMoreOpen, visible]);

  return (
    <MobileBottomNavDock $visible={visible} $hidden={!mobileBottomNavVisible && !mobileMoreOpen}>
      <AnimatePresence>
        {visible && mobileMoreOpen && (
          <MobileMoreSheet
            ref={mobileMoreSheetRef}
            $visible={visible}
            style={{ '--mobile-more-columns': HEADER_MOBILE_SECONDARY_ITEMS.length }}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <MobileMoreSheetList>
              {HEADER_MOBILE_SECONDARY_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <MobileMoreSheetLink key={item.to} to={item.to}>
                    <Icon size={18} />
                    <MobileMoreSheetLabel>{item.label}</MobileMoreSheetLabel>
                  </MobileMoreSheetLink>
                );
              })}
            </MobileMoreSheetList>
          </MobileMoreSheet>
        )}
      </AnimatePresence>

      <MobileBottomNav aria-label="Navigazione mobile" $visible={visible}>
        <MobileBottomNavList
          $visible={visible}
          style={{ '--mobile-bottom-nav-columns': 5 }}
        >
          {HEADER_MOBILE_PRIMARY_ITEMS.map((item) => {
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
              ref={mobileMoreButtonRef}
              type="button"
              $active={mobileMoreOpen || HEADER_MOBILE_SECONDARY_ITEMS.some((secondaryItem) => location.pathname === secondaryItem.to)}
              onClick={() => setMobileMoreOpen((open) => !open)}
              aria-expanded={mobileMoreOpen}
              aria-label="Altre sezioni"
            >
              <Ellipsis size={18} />
              <BottomNavLabel>Altro</BottomNavLabel>
            </MobileBottomNavButton>
          </MobileBottomNavItem>
        </MobileBottomNavList>
      </MobileBottomNav>
    </MobileBottomNavDock>
  );
});
