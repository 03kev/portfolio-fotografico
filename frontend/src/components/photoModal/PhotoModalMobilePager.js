import React from 'react';
import styled from 'styled-components';

const MobileViewport = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.9);
`;

const MobileCarousel = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const MobileSlide = styled.section`
  flex: 0 0 100%;
  min-width: 100%;
  min-height: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
`;

const MobileIndicatorBar = styled.div`
  display: flex;
  justify-content: center;
  padding: 10px 0 14px;
  margin-top: 4px;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 18, 0) 0%,
    rgba(10, 12, 18, 0.34) 100%
  );
  pointer-events: none;
`;

const MobileIndicatorPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(8, 10, 16, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.26);
`;

const MobileIndicatorDot = styled.span`
  width: ${({ $active }) => ($active ? '18px' : '7px')};
  height: 7px;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.25)'};
  transition: width 0.22s ease, background 0.22s ease, opacity 0.22s ease;
  opacity: ${({ $active }) => ($active ? 1 : 0.9)};
`;

const PhotoModalMobilePager = ({
  activeSlide,
  carouselRef,
  children,
  onScroll
}) => (
  <MobileViewport>
    <MobileCarousel ref={carouselRef} onScroll={onScroll}>
      {React.Children.map(children, (child, index) => (
        <MobileSlide aria-label={index === 0 ? 'Foto' : 'Dettagli'}>{child}</MobileSlide>
      ))}
    </MobileCarousel>
    <MobileIndicatorBar>
      <MobileIndicatorPill aria-hidden="true">
        <MobileIndicatorDot $active={activeSlide === 0} />
        <MobileIndicatorDot $active={activeSlide === 1} />
      </MobileIndicatorPill>
    </MobileIndicatorBar>
  </MobileViewport>
);

export default PhotoModalMobilePager;
